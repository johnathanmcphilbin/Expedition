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

/** Split SQL on semicolons that are not inside quotes, comments, or dollar bodies. */
export function splitSql(sql) {
	const statements = [];
	let current = '';
	let i = 0;
	let dollar = null;
	let inSingle = false;
	let inLine = false;
	let inBlock = false;
	while (i < sql.length) {
		const c = sql[i];
		const next = sql[i + 1];
		if (dollar) {
			if (sql.startsWith(dollar, i)) {
				current += dollar;
				i += dollar.length;
				dollar = null;
				continue;
			}
			current += c;
			i++;
			continue;
		}
		if (inSingle) {
			current += c;
			if (c === "'" && next === "'") {
				current += next;
				i += 2;
				continue;
			}
			if (c === "'") inSingle = false;
			i++;
			continue;
		}
		if (inLine) {
			current += c;
			if (c === '\n') inLine = false;
			i++;
			continue;
		}
		if (inBlock) {
			current += c;
			if (c === '*' && next === '/') {
				current += '/';
				i += 2;
				inBlock = false;
				continue;
			}
			i++;
			continue;
		}
		if (c === '-' && next === '-') {
			inLine = true;
			current += c;
			i++;
			continue;
		}
		if (c === '/' && next === '*') {
			inBlock = true;
			current += c;
			i++;
			continue;
		}
		if (c === "'") {
			inSingle = true;
			current += c;
			i++;
			continue;
		}
		if (c === '$') {
			const match = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
			if (match) {
				dollar = match[0];
				current += dollar;
				i += dollar.length;
				continue;
			}
		}
		if (c === ';') {
			const statement = current.trim();
			if (statement) statements.push(statement);
			current = '';
			i++;
			continue;
		}
		current += c;
		i++;
	}
	const tail = current.trim();
	if (tail) statements.push(tail);
	return statements;
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
	const withoutMeta = raw
		.split('\n')
		.filter((line) => !line.startsWith('\\'))
		.join('\n');
	for (const original of splitSql(withoutMeta)) {
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
	let carry = '';
	const state = { dollar: null, inSingle: false, inLine: false, inBlock: false };
	const emit = async (statement) => {
		if (!statement || statement.startsWith('\\')) return;
		const sanitized = sanitizeDump(statement);
		changes.push(...sanitized.changes);
		for (const kept of sanitized.statements) await onStatement(kept);
	};
	for await (const chunk of createReadStream(filePath, { encoding: 'utf8', highWaterMark: 64 * 1024 })) {
		carry += chunk;
		carry = await drain(carry, state, emit);
	}
	await emit(carry.trim());
	return changes;
}

async function drain(buf, state, emit) {
	let out = '';
	let i = 0;
	while (i < buf.length) {
		const c = buf[i];
		const next = buf[i + 1];
		if (state.dollar) {
			if (buf.startsWith(state.dollar, i)) {
				out += state.dollar;
				i += state.dollar.length;
				state.dollar = null;
				continue;
			}
			out += c;
			i++;
			continue;
		}
		if (state.inSingle) {
			out += c;
			if (c === "'" && next === "'") {
				out += next;
				i += 2;
				continue;
			}
			if (c === "'") state.inSingle = false;
			i++;
			continue;
		}
		if (state.inLine) {
			out += c;
			if (c === '\n') state.inLine = false;
			i++;
			continue;
		}
		if (state.inBlock) {
			out += c;
			if (c === '*' && next === '/') {
				out += '/';
				i += 2;
				state.inBlock = false;
				continue;
			}
			i++;
			continue;
		}
		if (c === '-' && next === '-') {
			state.inLine = true;
			out += c;
			i++;
			continue;
		}
		if (c === '/' && next === '*') {
			state.inBlock = true;
			out += c;
			i++;
			continue;
		}
		if (c === "'") {
			state.inSingle = true;
			out += c;
			i++;
			continue;
		}
		if (c === '$') {
			const match = buf.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
			if (match) {
				state.dollar = match[0];
				out += state.dollar;
				i += state.dollar.length;
				continue;
			}
			if (i === buf.length - 1) return out + buf.slice(i);
		}
		if (c === ';') {
			const statement = out.trim();
			out = '';
			i++;
			if (statement) await emit(statement);
			continue;
		}
		out += c;
		i++;
	}
	return out;
}
