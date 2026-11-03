#!/usr/bin/env node
/**
 * Local proof of the migration scripts against Postgres on this machine.
 * Not part of the production cutover.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { openReadOnly } from './lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const adminUrl = process.env.SELF_TEST_ADMIN_URL || 'postgres://exp:exp-local-only@127.0.0.1:5432/postgres';
const srcUrl = adminUrl.replace(/\/postgres(\?|$)/, '/expedition_src$1');
const dstUrl = adminUrl.replace(/\/postgres(\?|$)/, '/expedition_dst$1');
const bytes = Buffer.from('hello-expedition-file');

function run(cmd, args, env) {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, { env: { ...process.env, ...env }, cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
		let out = '';
		child.stdout.on('data', (chunk) => {
			out += chunk;
		});
		child.stderr.on('data', (chunk) => {
			out += chunk;
		});
		child.on('exit', (code) => resolve({ code, out }));
		child.on('error', reject);
	});
}

async function recreate(name) {
	const client = new pg.Client({ connectionString: adminUrl });
	await client.connect();
	await client.query(`drop database if exists ${name} with (force)`);
	await client.query(`create database ${name}`);
	await client.end();
}

const fake = http.createServer((req, res) => {
	const url = new URL(req.url, 'http://127.0.0.1');
	if (req.method !== 'GET' && req.method !== 'POST') {
		res.writeHead(500);
		res.end('source write attempted');
		return;
	}
	if (req.method === 'POST' && url.pathname === '/storage/v1/object/list/checkpoint-images') {
		let body = '';
		req.on('data', (chunk) => {
			body += chunk;
		});
		req.on('end', () => {
			const prefix = JSON.parse(body || '{}').prefix || '';
			const file = { name: 'a.png', id: 'obj', metadata: { mimetype: 'image/png', size: bytes.length } };
			// Root returns the folder and the same object by its full path.
			// The folder walk returns it again. That is one object, listed twice.
			let rows = [];
			if (prefix === '') {
				rows = [{ name: 'user', id: null }, { name: 'user/a.png', id: 'flat', metadata: file.metadata }];
			} else if (prefix.startsWith('user')) rows = [file];
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify(rows));
		});
		return;
	}
	if (req.method === 'POST' && url.pathname.startsWith('/storage/v1/object/list/')) {
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end('[]');
		return;
	}
	if (req.method === 'GET' && url.pathname === '/storage/v1/object/checkpoint-images/user/a.png') {
		res.writeHead(200, { 'content-type': 'image/png' });
		res.end(bytes);
		return;
	}
	res.writeHead(404);
	res.end('missing');
});
await new Promise((resolve) => fake.listen(0, '127.0.0.1', resolve));
const storageUrl = `http://127.0.0.1:${fake.address().port}`;

let failed = 0;
function check(name, ok, detail = '') {
	console.log(`${ok ? 'ok' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
	if (!ok) failed++;
}

await recreate('expedition_src');
await recreate('expedition_dst');
const applied = await run('sh', ['scripts/dev/apply-repo-migrations.sh', srcUrl]);
check('replay migrations on plain postgres', applied.code === 0, applied.out.slice(-400));

const src = new pg.Client({ connectionString: srcUrl });
await src.connect();
await src.query(`insert into users (hackclub_id, display_name, role) values ('self-test', 'Self Test', 'admin')`);
await src.query('drop table if exists public.files');
await src.end();

const out = await mkdtemp(path.join(tmpdir(), 'expedition-backup-'));
const env = {
	SOURCE_DATABASE_URL: srcUrl,
	TARGET_DATABASE_URL: dstUrl,
	SUPABASE_URL: storageUrl,
	SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key'
};
const backup = await run('node', ['scripts/migrate/backup-source.mjs', '--out', out], env);
check('backup source', backup.code === 0, backup.out.slice(-300));

const refused = await run('node', ['scripts/migrate/restore-target.mjs', '--dump', path.join(out, 'public.dump'), '--target-url', srcUrl], env);
check('restore refuses the source url', refused.code !== 0);

const restored = await run('node', ['scripts/migrate/restore-target.mjs', '--dump', path.join(out, 'public.dump')], env);
check('restore into empty target', restored.code === 0, restored.out.slice(-300));
const again = await run('node', ['scripts/migrate/restore-target.mjs', '--dump', path.join(out, 'public.dump')], env);
check('second restore without --fresh-target is refused', again.code !== 0, again.out.slice(-200));

const copied = await run('node', ['scripts/migrate/copy-storage.mjs'], env);
check(
	'copy storage',
	copied.code === 0 &&
		copied.out.includes('rows at start 0') &&
		copied.out.includes('inserted 1') &&
		copied.out.includes('already stored 0') &&
		copied.out.includes('duplicate listings 1'),
	copied.out.slice(-500)
);
const copiedAgain = await run('node', ['scripts/migrate/copy-storage.mjs'], env);
check(
	'copy storage is idempotent',
	copiedAgain.code === 0 && copiedAgain.out.includes('inserted 0') && copiedAgain.out.includes('already stored 1'),
	copiedAgain.out.slice(-500)
);

const verified = await run('node', ['scripts/migrate/verify.mjs'], env);
check(
	'verify matches',
	verified.code === 0 &&
		verified.out.includes('table files: TARGET-ONLY') &&
		!verified.out.includes('table files: MATCH') &&
		verified.out.includes('files checkpoint-images: MATCH') &&
		verified.out.includes('files submission-screenshots: MATCH') &&
		verified.out.includes('files submission-evidence: MATCH') &&
		verified.out.includes('files total: MATCH') &&
		verified.out.includes('verify: OVERALL MATCH'),
	verified.out.slice(-800)
);
const skippedFiles = await run('node', ['scripts/migrate/verify.mjs'], {
	...env,
	SUPABASE_URL: '',
	SUPABASE_SERVICE_ROLE_KEY: ''
});
check('verify without storage creds prints SKIP', skippedFiles.code === 0 && skippedFiles.out.includes('files: SKIP'), skippedFiles.out.slice(-300));

const extraDb = new pg.Client({ connectionString: dstUrl });
await extraDb.connect();
await extraDb.query('create table public.orchard_extra (id int)');
await extraDb.end();
const extra = await run('node', ['scripts/migrate/verify.mjs'], env);
check(
	'unexpected target table is TARGET-ONLY and fails',
	extra.code !== 0 && extra.out.includes('table orchard_extra: TARGET-ONLY') && !extra.out.includes('table orchard_extra: MATCH'),
	extra.out.slice(-500)
);
const dropExtra = new pg.Client({ connectionString: dstUrl });
await dropExtra.connect();
await dropExtra.query('drop table public.orchard_extra');
await dropExtra.end();

const dst = new pg.Client({ connectionString: dstUrl });
await dst.connect();
await dst.query(`update users set display_name = 'changed' where hackclub_id = 'self-test'`);
await dst.end();
const drifted = await run('node', ['scripts/migrate/verify.mjs'], env);
check('verify catches a changed row', drifted.code !== 0);

const reader = await openReadOnly(srcUrl, 'source');
let blocked = false;
try {
	await reader.query(`insert into users (hackclub_id) values ('nope')`);
} catch (error) {
	blocked = /blocked write|read-only|read only/i.test(error.message);
}
await reader.end();
check('read-only client rejects inserts', blocked);

const srcAgain = new pg.Client({ connectionString: srcUrl });
await srcAgain.connect();
await srcAgain.query(`
	do $$ begin
	  if not exists (select 1 from pg_roles where rolname = 'control_tower_expedition_ro') then
	    create role control_tower_expedition_ro nologin;
	  end if;
	end $$;
	grant select (hackclub_id, display_name) on users to control_tower_expedition_ro;
`);
await srcAgain.end();
const roleSql = path.join(out, 'ro.sql');
const generated = await run('node', ['scripts/migrate/readonly-role.mjs', '--out', roleSql], env);
check('generate read-only role from column_privileges', generated.code === 0, generated.out.slice(-200));
const appliedRole = await run('psql', [dstUrl, '-v', 'ON_ERROR_STOP=1', '-f', roleSql]);
check('apply generated role on the target', appliedRole.code === 0, appliedRole.out.slice(-200));

const fresh = await run('node', ['scripts/migrate/restore-target.mjs', '--dump', path.join(out, 'public.dump'), '--fresh-target'], env);
check('fresh-target restore replaces the target', fresh.code === 0, fresh.out.slice(-200));

const noFlags = await run('node', ['scripts/migrate/decommission-supabase.mjs']);
check('decommission without flags exits 2', noFlags.code === 2);
const wrongHost = await run(
	'node',
	['scripts/migrate/decommission-supabase.mjs', '--confirm-decommission', '--project-ref', 'ulmowedmbobncmcriszs'],
	{ ...env, SOURCE_DATABASE_URL: srcUrl, DATABASE_URL: dstUrl, SCRATCH_DATABASE_URL: 'postgres://127.0.0.1/expedition_decommission_scratch' }
);
check('decommission refuses a non-supabase source', wrongHost.code === 2);

await rm(out, { recursive: true, force: true });
fake.close();
if (failed) {
	console.error(`${failed} check(s) failed`);
	process.exit(1);
}
console.log('self-test passed');
