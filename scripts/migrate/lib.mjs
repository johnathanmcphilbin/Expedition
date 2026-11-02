// @ts-nocheck
/**
 * Shared helpers for the migration scripts.
 *
 * Source database connections opened here are always read-only
 * (default_transaction_read_only=on, plus a rejected-write probe, plus a
 * SQL allow-list). Nothing in this module writes to the source, deletes
 * storage objects, or imports the decommission script.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import pg from 'pg';

export const PROJECT_REF = 'ulmowedmbobncmcriszs';
export const BUCKETS = ['checkpoint-images', 'submission-screenshots', 'submission-evidence'];
export const FILES_TABLE = 'files';

const WRITE_SQL = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|comment|copy|vacuum|reindex|cluster|refresh|merge|call|do)\b/i;

export function sourceUrlFrom(args = {}) {
	return args['source-url'] || process.env.SOURCE_DATABASE_URL;
}

export function targetUrlFrom(args = {}) {
	// Orchard injects the bound database as DATABASE_URL ("Variables -> Use a resource").
	return args['target-url'] || process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;
}

export function supabaseUrlFrom(args = {}) {
	return args['supabase-url'] || process.env.SUPABASE_URL;
}

export function serviceRoleFrom(args = {}) {
	return args['service-role-key'] || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function parseArgs(argv) {
	const out = { _: [] };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (!arg.startsWith('--')) {
			out._.push(arg);
			continue;
		}
		const key = arg.slice(2);
		const next = argv[i + 1];
		if (next === undefined || next.startsWith('--')) out[key] = true;
		else {
			out[key] = next;
			i++;
		}
	}
	return out;
}

export function quoteIdent(name) {
	return `"${String(name).replace(/"/g, '""')}"`;
}

export function sameDatabase(a, b) {
	const left = describeDatabase(a);
	const right = describeDatabase(b);
	return left.host === right.host && left.port === right.port && left.database === right.database && left.user === right.user;
}

export function describeDatabase(connectionString) {
	const url = new URL(connectionString);
	return {
		host: url.hostname.toLowerCase(),
		port: url.port || '5432',
		database: decodeURIComponent(url.pathname.replace(/^\//, '')),
		user: decodeURIComponent(url.username)
	};
}

/** libpq environment for pg_dump / pg_restore / psql. Password stays in the environment, not argv. */
export function libpqEnv(connectionString, baseEnv = process.env) {
	const url = new URL(connectionString);
	const env = { ...baseEnv };
	env.PGHOST = url.hostname;
	env.PGPORT = url.port || '5432';
	env.PGUSER = decodeURIComponent(url.username);
	env.PGPASSWORD = decodeURIComponent(url.password);
	env.PGDATABASE = decodeURIComponent(url.pathname.replace(/^\//, '') || 'postgres');
	const ssl = url.searchParams.get('sslmode');
	if (ssl) env.PGSSLMODE = ssl;
	return env;
}

export function readOnlyPgEnv(baseEnv = process.env) {
	const env = { ...baseEnv };
	const flag = '-c default_transaction_read_only=on';
	const prev = env.PGOPTIONS || '';
	env.PGOPTIONS = prev.includes('default_transaction_read_only') ? prev : `${prev} ${flag}`.trim();
	return env;
}

export function run(cmd, args, env = process.env) {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
		let stderr = '';
		let stdout = '';
		child.stdout.on('data', (chunk) => {
			stdout += chunk;
		});
		child.stderr.on('data', (chunk) => {
			stderr += chunk;
		});
		child.on('error', reject);
		child.on('exit', (code) => {
			if (code === 0) resolve({ stdout, stderr });
			else reject(new Error(`${cmd} exited ${code}\n${stderr || stdout}`));
		});
	});
}

export async function sha256File(path) {
	const hash = createHash('sha256');
	await new Promise((resolve, reject) => {
		createReadStream(path)
			.on('data', (chunk) => hash.update(chunk))
			.on('end', resolve)
			.on('error', reject);
	});
	return hash.digest('hex');
}

export function md5Buffer(buf) {
	return createHash('md5').update(buf).digest('hex');
}

/**
 * A source (or verify-target) session that cannot write.
 *
 * Orchard's pooler is transaction mode and often drops startup parameters, so
 * the guard that always works is an explicit `BEGIN READ ONLY` held for the
 * whole session, checked with `SHOW transaction_read_only`, plus a write probe
 * inside a savepoint. A startup `default_transaction_read_only=on` is attempted
 * first and skipped when the pooler rejects it. The SQL filter stops this
 * process from issuing a write even if the server setting were ignored.
 */
export async function openReadOnly(connectionString, label) {
	if (!connectionString) throw new Error(`${label}: connection string is missing`);
	const client = await connectPreferReadOnly(connectionString, label);
	try {
		await client.query('begin read only');
		const show = await client.query('show transaction_read_only');
		if (show.rows[0].transaction_read_only !== 'on') {
			throw new Error(`${label}: transaction is not read-only`);
		}
		await client.query('savepoint expedition_ro_probe');
		let blocked = false;
		try {
			await client.query('create temp table expedition_ro_probe (id int)');
		} catch (error) {
			if (!/read-only|read only/i.test(error.message)) throw error;
			blocked = true;
		}
		if (!blocked) throw new Error(`${label}: server accepted a write. Refusing to continue.`);
		await client.query('rollback to savepoint expedition_ro_probe');
		await assertReadsAllRows(client, label);
	} catch (error) {
		await client.end().catch(() => {});
		throw error;
	}

	const raw = client.query.bind(client);
	client.query = (text, params) => {
		const sql = typeof text === 'string' ? text : text?.text;
		if (sql && WRITE_SQL.test(sql)) {
			throw new Error(`${label}: blocked write SQL: ${sql.slice(0, 120)}`);
		}
		return raw(text, params);
	};
	return client;
}

async function connectPreferReadOnly(connectionString, label) {
	try {
		const client = new pg.Client({
			connectionString,
			application_name: `expedition-migrate-ro:${label}`,
			options: '-c default_transaction_read_only=on'
		});
		await client.connect();
		return client;
	} catch {
		const client = new pg.Client({
			connectionString,
			application_name: `expedition-migrate-ro:${label}`
		});
		await client.connect();
		return client;
	}
}

/** Tables with RLS this role would not see through. Empty means a count is trustworthy. */
export async function hiddenRlsTables(client) {
	const { rows } = await client.query(`
		select c.relname
		from pg_class c
		join pg_namespace n on n.oid = c.relnamespace
		join pg_roles r on r.rolname = current_user
		where n.nspname = 'public'
		  and c.relkind = 'r'
		  and c.relrowsecurity
		  and not r.rolsuper
		  and not r.rolbypassrls
		  and c.relowner <> r.oid
		  and not exists (
		    select 1 from pg_depend d
		    where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e'
		  )
		order by 1
	`);
	return rows.map((row) => row.relname);
}

export async function assertReadsAllRows(client, label) {
	let hidden = await hiddenRlsTables(client);
	if (hidden.length) {
		const member = await client.query(
			`select 1 from pg_roles where rolname = 'expedition' and pg_has_role(current_user, 'expedition', 'member')`
		);
		if (member.rows.length) {
			await client.query('set local role expedition');
			hidden = await hiddenRlsTables(client);
		}
	}
	if (hidden.length) {
		const who = await client.query('select current_user as role');
		throw new Error(
			`${label}: role "${who.rows[0].role}" would miss rows under RLS on ${hidden.slice(0, 8).join(', ')}. Connect as the table owner, a superuser, or the expedition role.`
		);
	}
}

/** Can create objects in public. Used by restore and file copy. */
export async function assertCanWriteSchema(client, label) {
	const { rows } = await client.query(
		`select current_user as me, has_schema_privilege(current_user, 'public', 'create') as can`
	);
	if (!rows[0]?.can) {
		throw new Error(`${label}: ${rows[0]?.me ?? '?'} cannot create objects in schema public`);
	}
}

export function assertRestoreTarget(connectionString) {
	const text = connectionString.toLowerCase();
	if (text.includes('supabase.co') || text.includes('supabase.com') || text.includes(PROJECT_REF)) {
		throw new Error('Refusing to restore or write into a URL that looks like the source Supabase project');
	}
	if (process.env.SOURCE_DATABASE_URL && sameDatabase(process.env.SOURCE_DATABASE_URL, connectionString)) {
		throw new Error('Refusing to write: target URL is the same database as SOURCE_DATABASE_URL');
	}
}

const NOT_EXTENSION_CLASS = `
  and not exists (
    select 1 from pg_depend d
    where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e'
  )`;

const NOT_EXTENSION_PROC = `
  and not exists (
    select 1 from pg_depend d
    where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
  )`;

export async function publicShape(client) {
	const { rows } = await client.query(`
		select
			(select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
			  where n.nspname = 'public' and c.relkind = 'r' ${NOT_EXTENSION_CLASS})::int as tables,
			(select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
			  where n.nspname = 'public' and c.relkind = 'v' ${NOT_EXTENSION_CLASS})::int as views,
			(select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
			  where n.nspname = 'public' and c.relkind = 'S' ${NOT_EXTENSION_CLASS})::int as sequences,
			(select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.prokind = 'f' ${NOT_EXTENSION_PROC})::int as functions
	`);
	return rows[0];
}

export function shapeIsEmpty(shape) {
	return shape.tables === 0 && shape.views === 0 && shape.sequences === 0 && shape.functions === 0;
}

const LIST_PATH = /^\/storage\/v1\/object\/list\/[^/]+$/;
const GET_PATH = /^\/storage\/v1\/object\/(?!list(?:\/|$)).+/;

/** Storage reads allowed against the source: list and download only. */
export function assertStorageRead(method, pathname) {
	if (method === 'POST' && LIST_PATH.test(pathname)) return;
	if (method === 'GET' && GET_PATH.test(pathname)) return;
	throw new Error(`blocked source storage ${method} ${pathname} (list and download only)`);
}

export function createSourceStorage({ supabaseUrl, serviceRoleKey }) {
	if (!supabaseUrl || !serviceRoleKey) {
		throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to read Storage');
	}
	const base = supabaseUrl.replace(/\/+$/, '');

	async function request(method, pathname, body) {
		assertStorageRead(method, pathname);
		const response = await fetch(`${base}${pathname}`, {
			method,
			headers: {
				Authorization: `Bearer ${serviceRoleKey}`,
				apikey: serviceRoleKey,
				...(body ? { 'Content-Type': 'application/json' } : {})
			},
			body: body ? JSON.stringify(body) : undefined
		});
		if (!response.ok) {
			const detail = await response.text();
			throw new Error(`storage ${method} ${pathname} failed: ${response.status} ${detail.slice(0, 300)}`);
		}
		return response;
	}

	async function listBucket(bucket) {
		const found = [];
		const seen = new Set();
		let listed = 0;
		let duplicateListings = 0;
		async function walk(prefix) {
			let offset = 0;
			for (;;) {
				const response = await request('POST', `/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
					prefix,
					limit: 1000,
					offset,
					sortBy: { column: 'name', order: 'asc' }
				});
				const rows = await response.json();
				if (!Array.isArray(rows) || rows.length === 0) break;
				for (const row of rows) {
					const name = `${prefix || ''}${row.name}`;
					// id == null is a folder. The list is one level, so walk it.
					// A file is sometimes also returned on a parent page under its
					// full path. Keep one path. copy-storage used to insert the
					// first sighting and then count the second as unchanged.
					if (row.id == null) await walk(`${name.replace(/\/$/, '')}/`);
					else {
						const objectPath = name.replace(/^\/+/, '');
						listed++;
						if (seen.has(objectPath)) {
							duplicateListings++;
							continue;
						}
						seen.add(objectPath);
						found.push({ bucket, path: objectPath, metadata: row.metadata ?? null });
					}
				}
				if (rows.length < 1000) break;
				offset += rows.length;
			}
		}
		await walk('');
		found.sort((a, b) => a.path.localeCompare(b.path));
		found.listed = listed;
		found.duplicateListings = duplicateListings;
		return found;
	}

	async function readObject(bucket, objectPath, { keepBytes }) {
		const encoded = objectPath.split('/').map(encodeURIComponent).join('/');
		const response = await request('GET', `/storage/v1/object/${encodeURIComponent(bucket)}/${encoded}`);
		if (!response.body) throw new Error(`storage download ${bucket}/${objectPath} had no body`);
		const sha = createHash('sha256');
		const md5 = keepBytes ? createHash('md5') : null;
		const chunks = keepBytes ? [] : null;
		let size = 0;
		const reader = response.body.getReader();
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				size += value.byteLength;
				sha.update(value);
				if (keepBytes) {
					md5.update(value);
					chunks.push(Buffer.from(value));
				}
			}
		} finally {
			reader.releaseLock();
		}
		const out = {
			size,
			sha256: sha.digest('hex'),
			contentType: response.headers.get('content-type')
		};
		if (keepBytes) {
			out.bytes = Buffer.concat(chunks, size);
			out.md5 = md5.digest('hex');
		}
		return out;
	}

	function hashObject(bucket, objectPath) {
		return readObject(bucket, objectPath, { keepBytes: false });
	}

	function download(bucket, objectPath) {
		return readObject(bucket, objectPath, { keepBytes: true });
	}

	async function listAll() {
		const objects = [];
		for (const bucket of BUCKETS) objects.push(...(await listBucket(bucket)));
		return objects;
	}

	return { listBucket, listAll, download, hashObject };
}

/** Same content type copy-storage stores: object metadata, then the response header. */
export function contentTypeOf(metadataType, headerType) {
	const raw = metadataType || headerType || 'application/octet-stream';
	return String(raw).split(';')[0].trim() || 'application/octet-stream';
}

export async function tableNames(client) {
	const { rows } = await client.query(`
		select c.relname as name
		from pg_class c
		join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public' and c.relkind = 'r' ${NOT_EXTENSION_CLASS}
		order by 1
	`);
	return rows.map((row) => row.name);
}

export async function fingerprintTable(client, table) {
	const ident = `public.${quoteIdent(table)}`;
	const count = await client.query(`select count(*)::bigint as n from ${ident}`);
	const hash = await client.query(
		`select md5(coalesce(string_agg(md5((t)::text), '' order by (t)::text), '')) as md5 from ${ident} as t`
	);
	return { name: table, count: count.rows[0].n.toString(), md5: hash.rows[0].md5 };
}

/** md5 of each row, aggregated in hash order so heap order does not matter. */
export async function fingerprintTableUnordered(client, table) {
	const ident = `public.${quoteIdent(table)}`;
	const count = await client.query(`select count(*)::bigint as n from ${ident}`);
	const hash = await client.query(
		`select md5(coalesce(string_agg(h, '' order by h), '')) as md5
		 from (select md5((t)::text) as h from ${ident} as t) s`
	);
	return { name: table, count: count.rows[0].n.toString(), md5: hash.rows[0].md5 };
}

export async function fileSha256Manifest(client) {
	const { rows: exists } = await client.query(`select to_regclass('public.files') as reg`);
	if (!exists[0]?.reg) return [];
	const { rows } = await client.query(`
		select bucket, path, size::bigint as size, encode(sha256(bytes), 'hex') as sha256
		from public.files
		order by bucket, path
	`);
	return rows.map((row) => ({
		bucket: row.bucket,
		path: row.path,
		size: Number(row.size),
		sha256: row.sha256
	}));
}

export async function fingerprintSequences(client) {
	const { rows } = await client.query(`
		select c.relname as name
		from pg_class c
		join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public' and c.relkind = 'S' ${NOT_EXTENSION_CLASS}
		order by 1
	`);
	const out = [];
	for (const row of rows) {
		// Reading a sequence returns last_value and is_called without advancing it.
		const value = await client.query(
			`select last_value::text as last_value, is_called from public.${quoteIdent(row.name)}`
		);
		out.push({ name: row.name, last_value: value.rows[0].last_value, is_called: value.rows[0].is_called });
	}
	return out;
}

export async function countFunctions(client) {
	const { rows } = await client.query(`
		select count(*)::int as n
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.prokind = 'f' ${NOT_EXTENSION_PROC}
	`);
	return rows[0].n;
}

export async function countTriggers(client) {
	const { rows } = await client.query(`
		select count(*)::int as n
		from pg_trigger tg
		join pg_class c on c.oid = tg.tgrelid
		join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public' and not tg.tgisinternal ${NOT_EXTENSION_CLASS}
	`);
	return rows[0].n;
}

export async function databaseSnapshot(client) {
	const allNames = await tableNames(client);
	// public.files holds every storage object as bytea. Fingerprinting it with
	// (t)::text would pull those bytes through the query. It is named in
	// tableNames and reported as TARGET-ONLY instead.
	const names = allNames.filter((name) => name !== FILES_TABLE);
	const tables = [];
	for (const name of names) tables.push(await fingerprintTableUnordered(client, name));
	return {
		tables,
		tableNames: allNames,
		sequences: await fingerprintSequences(client),
		functions: await countFunctions(client),
		triggers: await countTriggers(client)
	};
}

/** Tables, sequences, and the definitions of functions, triggers, views, and enums. */
export async function catalogSnapshot(client) {
	const base = await databaseSnapshot(client);
	const functions = await client.query(`
		select count(*)::int as n,
		       md5(coalesce(string_agg(h, '' order by h), '')) as md5
		from (
			select md5(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')') as h
			from pg_proc p
			join pg_namespace n on n.oid = p.pronamespace
			where n.nspname = 'public' and p.prokind = 'f' ${NOT_EXTENSION_PROC}
		) s
	`);
	const triggers = await client.query(`
		select count(*)::int as n,
		       md5(coalesce(string_agg(h, '' order by h), '')) as md5
		from (
			select md5(n.nspname || '.' || c.relname || ':' || tg.tgname) as h
			from pg_trigger tg
			join pg_class c on c.oid = tg.tgrelid
			join pg_namespace n on n.oid = c.relnamespace
			where n.nspname = 'public' and not tg.tgisinternal ${NOT_EXTENSION_CLASS}
		) s
	`);
	const views = await client.query(`
		select c.relname as name, md5(pg_get_viewdef(c.oid, true)) as md5
		from pg_class c
		join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public' and c.relkind = 'v' ${NOT_EXTENSION_CLASS}
		order by 1
	`);
	const enums = await client.query(`
		select t.typname as name, string_agg(e.enumlabel, ',' order by e.enumsortorder) as labels
		from pg_type t
		join pg_namespace n on n.oid = t.typnamespace
		join pg_enum e on e.enumtypid = t.oid
		where n.nspname = 'public'
		group by t.typname
		order by 1
	`);
	return {
		...base,
		functionSet: functions.rows[0],
		triggerSet: triggers.rows[0],
		views: views.rows,
		enums: enums.rows
	};
}

function pairLine(label, same, detail) {
	return `${label}: ${same ? 'MATCH' : 'MISMATCH'}${detail ? ` ${detail}` : ''}`;
}

/** Human summary. mismatches is the list of lines that fail verify. */
export function diffCatalog(source, target) {
	const lines = [];
	const mismatches = [];
	const push = (label, same, detail) => {
		const line = pairLine(label, same, detail);
		lines.push(line);
		if (!same) mismatches.push(line);
	};
	const pushRaw = (line, fails) => {
		lines.push(line);
		if (fails) mismatches.push(line);
	};
	const targetTables = new Map(target.tables.map((row) => [row.name, row]));
	const sourceTables = new Map(source.tables.map((row) => [row.name, row]));
	for (const [name, row] of sourceTables) {
		const other = targetTables.get(name);
		if (!other) {
			push(`table ${name}`, false, 'missing on target');
			continue;
		}
		const same = row.count === other.count && row.md5 === other.md5;
		push(`table ${name}`, same, `count ${row.count} md5 ${row.md5}`);
	}
	const sourceNames = new Set(source.tableNames ?? source.tables.map((row) => row.name));
	const targetNames = [...(target.tableNames ?? target.tables.map((row) => row.name))].sort();
	for (const name of targetNames) {
		if (sourceNames.has(name)) continue;
		// files is created by copy-storage. It is not a source table. Any other
		// name here is unexpected and fails verify, and it is never called MATCH.
		const expected = name === FILES_TABLE;
		pushRaw(
			expected ? `table ${name}: TARGET-ONLY` : `table ${name}: TARGET-ONLY (not on source; fails verify)`,
			!expected
		);
	}
	const targetSeq = new Map(target.sequences.map((row) => [row.name, row]));
	const sourceSeq = new Map(source.sequences.map((row) => [row.name, row]));
	for (const [name, row] of sourceSeq) {
		const other = targetSeq.get(name);
		const same = other && String(row.last_value) === String(other.last_value) && row.is_called === other.is_called;
		push(`sequence ${name}`, !!same, `last_value ${row.last_value} is_called ${row.is_called}`);
	}
	for (const name of [...targetSeq.keys()].sort()) {
		if (!sourceSeq.has(name)) pushRaw(`sequence ${name}: TARGET-ONLY (not on source; fails verify)`, true);
	}
	push(
		'functions',
		source.functionSet.n === target.functionSet.n && source.functionSet.md5 === target.functionSet.md5,
		`count ${source.functionSet.n} -> ${target.functionSet.n}`
	);
	push(
		'triggers',
		source.triggerSet.n === target.triggerSet.n && source.triggerSet.md5 === target.triggerSet.md5,
		`count ${source.triggerSet.n} -> ${target.triggerSet.n}`
	);
	const viewKey = (rows) => rows.map((row) => `${row.name}:${row.md5}`).join('|');
	push('views', viewKey(source.views) === viewKey(target.views), `count ${source.views.length} -> ${target.views.length}`);
	const enumKey = (rows) => rows.map((row) => `${row.name}:${row.labels}`).join('|');
	push('enums', enumKey(source.enums) === enumKey(target.enums), `count ${source.enums.length} -> ${target.enums.length}`);
	return { lines, mismatches };
}

export function diffSnapshots(source, target) {
	const mismatches = [];
	const sourceTables = new Map(source.tables.map((row) => [row.name, row]));
	const targetTables = new Map(target.tables.map((row) => [row.name, row]));
	for (const [name, row] of sourceTables) {
		const other = targetTables.get(name);
		if (!other) {
			mismatches.push(`table ${name}: missing on target`);
			continue;
		}
		if (row.count !== other.count) mismatches.push(`table ${name}: count ${row.count} != ${other.count}`);
		if (row.md5 !== other.md5) mismatches.push(`table ${name}: md5 ${row.md5} != ${other.md5}`);
	}
	for (const name of targetTables.keys()) {
		if (!sourceTables.has(name)) mismatches.push(`table ${name}: present on target but not on source`);
	}

	const sourceSeq = new Map(source.sequences.map((row) => [row.name, row]));
	const targetSeq = new Map(target.sequences.map((row) => [row.name, row]));
	for (const [name, row] of sourceSeq) {
		const other = targetSeq.get(name);
		if (!other) {
			mismatches.push(`sequence ${name}: missing on target`);
			continue;
		}
		if (String(row.last_value) !== String(other.last_value) || row.is_called !== other.is_called) {
			mismatches.push(
				`sequence ${name}: ${row.last_value}/${row.is_called} != ${other.last_value}/${other.is_called}`
			);
		}
	}
	for (const name of targetSeq.keys()) {
		if (!sourceSeq.has(name)) mismatches.push(`sequence ${name}: present on target but not on source`);
	}

	if (source.functions !== target.functions) {
		mismatches.push(`functions: ${source.functions} != ${target.functions}`);
	}
	if (source.triggers !== target.triggers) {
		mismatches.push(`triggers: ${source.triggers} != ${target.triggers}`);
	}
	return mismatches;
}

export async function targetFileRows(client) {
	const { rows: exists } = await client.query(`select to_regclass('public.files') as reg`);
	if (!exists[0].reg) return [];
	// sha256(bytea) runs in Postgres. Node only receives the hex digest.
	const { rows } = await client.query(`
		select bucket, path, size::bigint as size, encode(sha256(bytes), 'hex') as sha256, content_type
		from public.files
		order by bucket, path
	`);
	return rows.map((row) => ({
		bucket: row.bucket,
		path: row.path,
		size: Number(row.size),
		sha256: row.sha256,
		content_type: row.content_type
	}));
}

/**
 * Compare streamed storage objects to public.files.
 * listings is the per-bucket { bucket, listed, duplicateListings } from listBucket.
 * Returns one MATCH/MISMATCH line per bucket, a total line, and the path differences.
 */
export function diffStoredFiles(sourceFiles, targetFiles, listings = []) {
	const lines = [];
	const mismatches = [];
	const key = (row) => `${row.bucket}\0${row.path}`;
	const listedBy = new Map(listings.map((row) => [row.bucket, row]));
	const buckets = [...BUCKETS];
	for (const row of [...sourceFiles, ...targetFiles]) {
		if (!buckets.includes(row.bucket)) buckets.push(row.bucket);
	}
	let sourceCount = 0;
	let targetCount = 0;
	for (const bucket of buckets) {
		const src = sourceFiles.filter((row) => row.bucket === bucket);
		const dst = targetFiles.filter((row) => row.bucket === bucket);
		const problems = [];
		const srcMap = new Map();
		for (const row of src) {
			const id = key(row);
			if (srcMap.has(id)) problems.push(`file ${bucket}/${row.path}: duplicate source path`);
			srcMap.set(id, row);
		}
		const dstMap = new Map();
		for (const row of dst) {
			const id = key(row);
			if (dstMap.has(id)) problems.push(`file ${bucket}/${row.path}: duplicate target path`);
			dstMap.set(id, row);
		}
		for (const row of src) {
			const other = dstMap.get(key(row));
			if (!other) {
				problems.push(`file ${bucket}/${row.path}: missing on target`);
				continue;
			}
			if (row.size !== other.size) problems.push(`file ${bucket}/${row.path}: size ${row.size} != ${other.size}`);
			if (row.sha256 !== other.sha256) problems.push(`file ${bucket}/${row.path}: sha256 ${row.sha256} != ${other.sha256}`);
			if (row.content_type !== other.content_type) {
				problems.push(`file ${bucket}/${row.path}: content_type ${row.content_type} != ${other.content_type}`);
			}
		}
		for (const row of dst) {
			if (!srcMap.has(key(row))) problems.push(`file ${bucket}/${row.path}: extra on target`);
		}
		const note = listedBy.get(bucket);
		const listed = note ? ` (listed ${note.listed}, duplicate listings ${note.duplicateListings})` : '';
		const same = problems.length === 0;
		sourceCount += srcMap.size;
		targetCount += dstMap.size;
		lines.push(`files ${bucket}: ${same ? 'MATCH' : 'MISMATCH'} count ${srcMap.size} target ${dstMap.size}${listed}`);
		mismatches.push(...problems);
	}
	const sameTotal = mismatches.length === 0;
	lines.push(`files total: ${sameTotal ? 'MATCH' : 'MISMATCH'} count ${sourceCount} target ${targetCount}`);
	return { lines, mismatches };
}

export function diffFiles(sourceFiles, targetFiles) {
	const mismatches = [];
	const key = (row) => `${row.bucket}\0${row.path}`;
	const target = new Map(targetFiles.map((row) => [key(row), row]));
	const source = new Map(sourceFiles.map((row) => [key(row), row]));
	if (source.size !== target.size) {
		mismatches.push(`files: count ${source.size} != ${target.size}`);
	}
	for (const [id, row] of source) {
		const other = target.get(id);
		if (!other) {
			mismatches.push(`file ${row.bucket}/${row.path}: missing on target`);
			continue;
		}
		if (row.size !== other.size) mismatches.push(`file ${row.bucket}/${row.path}: size ${row.size} != ${other.size}`);
		if (row.md5 !== other.md5) mismatches.push(`file ${row.bucket}/${row.path}: md5 ${row.md5} != ${other.md5}`);
	}
	for (const [id, row] of target) {
		if (!source.has(id)) mismatches.push(`file ${row.bucket}/${row.path}: present on target but not on source`);
	}
	return mismatches;
}
