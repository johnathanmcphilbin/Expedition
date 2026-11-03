// @ts-nocheck
/**
 * Turn a public-schema pg_dump into something Orchard Postgres 17 can restore.
 *
 * Supabase dumps reference extensions and schemas that are not installed there
 * (supabase_vault, pg_graphql, pg_stat_statements, auth, storage, realtime,
 * vault, graphql). pgcrypto and uuid-ossp are kept, in schema public.
 * Every drop and rewrite is returned for the job log.
 */

const ALLOWED_EXTENSIONS = new Set(['pgcrypto', 'uuid-ossp', 'plpgsql']);

const FORBIDDEN_SCHEMA = /\b(auth|storage|vault|graphql|graphql_public|realtime|supabase_functions|supabase_migrations|pgbouncer|_realtime|net)\s*\./i;

const EXTENSION_REWRITES = [
	[/extensions\.gen_random_uuid\s*\(\s*\)/gi, 'gen_random_uuid()'],
	[/extensions\.uuid_generate_v4\s*\(\s*\)/gi, 'gen_random_uuid()'],
	[/extensions\.gen_random_bytes\s*\(/gi, 'gen_random_bytes('],
	[/extensions\.digest\s*\(/gi, 'digest('],
	[/extensions\.crypt\s*\(/gi, 'crypt('],
	[/extensions\.gen_salt\s*\(/gi, 'gen_salt(']
];

/**
 * Split SQL on semicolons that are outside quotes, comments, dollar bodies,
 * and COPY ... FROM stdin data. '' inside a string is one quote. E'...' and
 * U&'...' treat a backslash as an escape. A quote or backslash at the end of
 * a chunk is not decided until the next byte arrives.
 */
export function createSqlScanner() {
	const st = {
		mode: 'code',
		escape: false,
		dollar: '',
		block: 0,
		acc: '',
		buf: ''
	};

	function startsMeta(text, index) {
		if (text[index] !== '\\') return false;
		return index === 0 || text[index - 1] === '\n';
	}

	function push(chunk, flush = false) {
		st.buf += chunk;
		const statements = [];
		const s = st.buf;
		let i = 0;
		const hold = (from) => {
			st.buf = s.slice(from);
			i = s.length + 1;
		};
		while (i < s.length) {
			const c = s[i];
			const next = s[i + 1];
			const atEnd = i === s.length - 1;

			if (st.mode === 'copy') {
				st.acc += c;
				if (c === '\n' && /\n\\\.(\r)?\n$/.test(st.acc)) {
					const statement = st.acc.trim();
					st.acc = '';
					st.mode = 'code';
					if (statement) statements.push(statement);
				} else if (atEnd && /\n\\\.?\r?$/.test(st.acc)) {
					const keep = st.acc.match(/\n\\\.?\r?$/)[0];
					st.acc = st.acc.slice(0, -keep.length);
					hold(i - keep.length + 1);
				}
				i++;
				continue;
			}
			if (st.mode === 'line') {
				st.acc += c;
				if (c === '\n') st.mode = 'code';
				i++;
				continue;
			}
			if (st.mode === 'block') {
				st.acc += c;
				if (c === '/' && next === '*') {
					st.block++;
					st.acc += next;
					i += 2;
					continue;
				}
				if (c === '*' && next === '/') {
					st.acc += '/';
					i += 2;
					st.block--;
					if (st.block === 0) st.mode = 'code';
					continue;
				}
				if (c === '*' && atEnd) {
					st.acc = st.acc.slice(0, -1);
					hold(i);
					continue;
				}
				i++;
				continue;
			}
			if (st.mode === 'dollar') {
				const rest = s.slice(i);
				if (rest.startsWith(st.dollar)) {
					st.acc += st.dollar;
					i += st.dollar.length;
					st.mode = 'code';
					st.dollar = '';
					continue;
				}
				if (st.dollar.startsWith(rest)) {
					hold(i);
					continue;
				}
				st.acc += c;
				i++;
				continue;
			}
			if (st.mode === 'sq') {
				if (st.escape && c === '\\') {
					if (atEnd) {
						hold(i);
						continue;
					}
					st.acc += c + next;
					i += 2;
					continue;
				}
				if (c === "'") {
					if (atEnd) {
						hold(i);
						continue;
					}
					if (next === "'") {
						st.acc += "''";
						i += 2;
						continue;
					}
					st.acc += c;
					st.mode = 'code';
					st.escape = false;
					i++;
					continue;
				}
				st.acc += c;
				i++;
				continue;
			}

			if (c === '-' && next === '-') {
				st.mode = 'line';
				st.acc += c;
				i++;
				continue;
			}
			if (c === '-' && atEnd) {
				hold(i);
				continue;
			}
			if (c === '/' && next === '*') {
				st.mode = 'block';
				st.block = 1;
				st.acc += c;
				i++;
				continue;
			}
			if (c === '/' && atEnd) {
				hold(i);
				continue;
			}
			if (startsMeta(s, i)) {
				const nl = s.indexOf('\n', i);
				if (nl === -1) {
					hold(i);
					continue;
				}
				i = nl + 1;
				continue;
			}
			if (c === "'") {
				const prior = st.acc;
				st.escape = /(?:^|[^A-Za-z0-9_])[Ee]$/.test(prior) || /(?:^|[^A-Za-z0-9_])[Uu]&$/.test(prior);
				st.mode = 'sq';
				st.acc += c;
				i++;
				continue;
			}
			if (c === '$') {
				const rest = s.slice(i);
				const match = rest.match(/^\$[A-Za-z0-9_]*\$/);
				if (match) {
					st.mode = 'dollar';
					st.dollar = match[0];
					st.acc += st.dollar;
					i += st.dollar.length;
					continue;
				}
				if (/^\$[A-Za-z0-9_]*$/.test(rest)) {
					hold(i);
					continue;
				}
			}
			if (c === ';') {
				const statement = st.acc.trim();
				st.acc = '';
				i++;
				if (/^\s*COPY\b/i.test(statement) && /\bFROM\s+stdin\s*$/i.test(statement)) {
					st.mode = 'copy';
					st.acc = `${statement};\n`;
					continue;
				}
				if (statement) statements.push(statement);
				continue;
			}
			st.acc += c;
			i++;
		}
		if (i <= s.length) st.buf = '';
		if (flush) {
			st.acc += st.buf;
			st.buf = '';
			const tail = st.acc.trim();
			st.acc = '';
			if (tail) statements.push(tail);
		}
		return statements;
	}

	return { push };
}

/** Split SQL on semicolons that are not inside quotes, comments, or dollar bodies. */
export function splitSql(sql) {
	return createSqlScanner().push(sql, true);
}

function extensionName(sql) {
	const match = sql.match(/extension(?:\s+if\s+not\s+exists)?\s+"?([a-z0-9_]+)"?/i);
	return match?.[1]?.toLowerCase() ?? null;
}

function kindOf(sql) {
	const match = sql.match(/^(?:create|alter|comment|drop|grant|revoke|insert|update|select|set)\s+(?:or\s+replace\s+)?(?:unlogged\s+|global\s+|temp(?:orary)?\s+|materialized\s+)?([a-z]+)/i);
	return (match?.[1] || sql.split(/\s+/)[0] || 'statement').toLowerCase();
}

function nameOf(sql, kind) {
	if (kind === 'extension') return extensionName(sql);
	const match = sql.match(
		/(?:function|table|view|sequence|type|schema)\s+(?:if\s+(?:not\s+)?exists\s+)?(?:public\s*\.\s*)?"?([a-zA-Z0-9_]+)"?/i
	);
	return match?.[1] ?? null;
}

function rewriteExtensions(sql) {
	let out = sql;
	let changed = false;
	for (const [pattern, replacement] of EXTENSION_REWRITES) {
		if (pattern.test(out)) {
			changed = true;
			out = out.replace(pattern, replacement);
		}
		pattern.lastIndex = 0;
	}
	return { sql: out, changed };
}

function tidyCommas(sql) {
	return sql
		.replace(/,\s*,/g, ',')
		.replace(/\(\s*,/g, '(')
		.replace(/,\s*\)/g, ')');
}

function rewriteForbiddenReferences(sql) {
	const notes = [];
	let out = sql;
	const before = out;
	out = out.replace(
		/\s+DEFAULT\s+(?:auth|storage|vault|graphql|graphql_public|realtime)\s*\.\s*[A-Za-z0-9_]+\s*\([^)]*\)/gi,
		() => {
			notes.push('removed a column default that called a Supabase-only schema');
			return '';
		}
	);
	out = out.replace(
		/\s+REFERENCES\s+(?:auth|storage|vault|graphql|graphql_public|realtime)\s*\.\s*[A-Za-z0-9_."]+(?:\s*\([^)]*\))?(?:\s+MATCH\s+\w+)?(?:\s+ON\s+DELETE\s+(?:CASCADE|RESTRICT|SET\s+NULL|SET\s+DEFAULT|NO\s+ACTION))?(?:\s+ON\s+UPDATE\s+(?:CASCADE|RESTRICT|SET\s+NULL|SET\s+DEFAULT|NO\s+ACTION))?(?:\s+DEFERRABLE(?:\s+INITIALLY\s+(?:DEFERRED|IMMEDIATE))?)?/gi,
		() => {
			notes.push('removed a foreign key to a Supabase-only schema');
			return '';
		}
	);
	out = out.replace(
		/,?\s*CONSTRAINT\s+"?[^",\n]+"?\s+FOREIGN\s+KEY\s*\([^)]*\)\s+REFERENCES\s+(?:auth|storage|vault|graphql|realtime)\s*\.[^,\n)]+/gi,
		() => {
			notes.push('removed a table constraint to a Supabase-only schema');
			return '';
		}
	);
	out = tidyCommas(out);
	return { sql: out, notes, changed: out !== before };
}

function isData(sql) {
	return /^(insert|update|copy)\b/i.test(sql);
}

/** Comments pg_dump puts above a statement hide the real first keyword. */
function stripLeadingComments(sql) {
	let rest = sql.trim();
	for (;;) {
		if (rest.startsWith('--')) {
			const nl = rest.indexOf('\n');
			rest = (nl === -1 ? '' : rest.slice(nl + 1)).trim();
			continue;
		}
		if (rest.startsWith('/*')) {
			const end = rest.indexOf('*/');
			rest = (end === -1 ? '' : rest.slice(end + 2)).trim();
			continue;
		}
		break;
	}
	return rest;
}

/**
 * @returns {{ sql: string, changes: { action: 'drop' | 'rewrite', kind: string, name: string | null, reason: string, preview: string }[] }}
 */
export function sanitizeDump(raw) {
	const changes = [];
	const kept = [];
	for (const original of splitSql(raw)) {
		const preview = original.replace(/\s+/g, ' ').slice(0, 180);
		if (original.startsWith('\\')) {
			changes.push({ action: 'drop', kind: 'meta', name: null, reason: 'psql meta-command', preview });
			continue;
		}
		let sql = stripLeadingComments(original);
		if (!sql) continue;
		const extRewritten = rewriteExtensions(sql);
		if (extRewritten.changed) {
			sql = extRewritten.sql;
			changes.push({
				action: 'rewrite',
				kind: kindOf(sql),
				name: nameOf(sql, kindOf(sql)),
				reason: 'rewrote extensions.* calls to public/pg_catalog equivalents',
				preview
			});
		}

		const kind = kindOf(sql);
		const name = nameOf(sql, kind);

		if (/^create\s+extension\b/i.test(sql) || /^alter\s+extension\b/i.test(sql) || /^comment\s+on\s+extension\b/i.test(sql)) {
			const ext = extensionName(sql);
			if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
				changes.push({
					action: 'drop',
					kind: 'extension',
					name: ext,
					reason: 'extension is not available on Orchard (or is not used by public)',
					preview
				});
				continue;
			}
			const rewritten = `CREATE EXTENSION IF NOT EXISTS ${ext === 'uuid-ossp' ? '"uuid-ossp"' : ext} WITH SCHEMA public`;
			if (rewritten.replace(/\s+/g, ' ') !== sql.replace(/\s+/g, ' ')) {
				changes.push({
					action: 'rewrite',
					kind: 'extension',
					name: ext,
					reason: 'install kept extension into schema public',
					preview
				});
			}
			kept.push(rewritten);
			continue;
		}

		if (/^create\s+schema\b/i.test(sql) && /\bpublic\b/i.test(sql)) {
			changes.push({ action: 'drop', kind: 'schema', name: 'public', reason: 'schema public already exists', preview });
			continue;
		}

		if (/^set\s+row_security\b/i.test(sql)) {
			changes.push({
				action: 'drop',
				kind: 'set',
				name: 'row_security',
				reason: 'SET row_security = off requires a superuser; RLS stays enabled',
				preview
			});
			continue;
		}
		if (/set_config\s*\(\s*'search_path'/i.test(sql)) {
			kept.push(`SELECT pg_catalog.set_config('search_path', 'public', false)`);
			changes.push({ action: 'rewrite', kind: 'set', name: 'search_path', reason: 'search_path set to public', preview });
			continue;
		}

		if (!isData(sql) && FORBIDDEN_SCHEMA.test(sql)) {
			const rewritten = rewriteForbiddenReferences(sql);
			if (rewritten.changed && !FORBIDDEN_SCHEMA.test(rewritten.sql)) {
				kept.push(rewritten.sql);
				changes.push({
					action: 'rewrite',
					kind,
					name,
					reason: rewritten.notes.join('; ') || 'removed Supabase-only references',
					preview
				});
				continue;
			}
			changes.push({
				action: 'drop',
				kind,
				name,
				reason: 'references auth, storage, vault, graphql, or realtime, and could not be rewritten safely',
				preview
			});
			continue;
		}

		kept.push(sql);
	}
	return { sql: `${kept.filter(Boolean).join(';\n\n')};\n`, statements: kept.filter(Boolean), changes };
}

/**
 * Walk a dump file one statement at a time. Only the current statement is kept in memory.
 * `onStatement` receives each kept statement. Returns the change log.
 */
export async function streamSanitizeFile(filePath, onStatement) {
	const { createReadStream } = await import('node:fs');
	const changes = [];
	const scan = createSqlScanner();
	const emit = async (statement) => {
		if (!statement || statement.startsWith('\\')) return;
		const sanitized = sanitizeDump(statement);
		changes.push(...sanitized.changes);
		for (const kept of sanitized.statements) await onStatement(kept);
	};
	for await (const chunk of createReadStream(filePath, { encoding: 'utf8', highWaterMark: 64 * 1024 })) {
		for (const statement of scan.push(chunk, false)) await emit(statement);
	}
	for (const statement of scan.push('', true)) await emit(statement);
	return changes;
}
