#!/usr/bin/env node
/**
 * Cutover delta. Run while the site is in MAINTENANCE_MODE.
 *
 *   (a) read-only pg_dump of schema public, same flags and filter as initial-load
 *   (b) replace the target's public schema in one transaction
 *   (c) files table, then post-load (roles.sql skip/grants, sequence print)
 *   (d) copy-storage (list and download only)
 *   (e) verify
 *   (f) final-sync: OK only when verify is OVERALL MATCH
 *
 * The dump is kept on disk. Step (b) does not start unless the dump file
 * exists and the filter can walk it. A failure inside (b) rolls the
 * transaction back, so a failed statement does not leave public empty.
 * DATABASE_URL is refused when its host looks like Supabase.
 *
 * Dropping public terminates other sessions on that database, including
 * PostgREST. Restart the PostgREST app after this command.
 *
 * Nothing in this file writes to or deletes from Supabase.
 */
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { copyStorage } from './copy-storage.mjs';
import {
	assertRestoreTarget,
	libpqEnv,
	openReadOnly,
	parseArgs,
	PROJECT_REF,
	readOnlyPgEnv,
	run,
	serviceRoleFrom,
	sourceUrlFrom,
	supabaseUrlFrom,
	targetUrlFrom
} from './lib.mjs';
import { streamSanitizeFile } from './sanitize-dump.mjs';
import { printReport, verifyPair } from './verify.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const rolesSql = path.resolve(here, '../../deploy/postgrest/roles.sql');
const filesSqlPath = path.resolve(here, '../../supabase/migrations/0046_files.sql');
const postLoadScript = path.resolve(here, 'post-load.mjs');

function assertOrchardTarget(connectionString) {
	assertRestoreTarget(connectionString);
	let host = '';
	try {
		host = new URL(connectionString).hostname.toLowerCase();
	} catch {
		throw new Error('DATABASE_URL is not a valid URL');
	}
	if (host.includes('supabase') || host.includes(PROJECT_REF)) {
		throw new Error('Refusing to drop schema: DATABASE_URL host looks like Supabase');
	}
}

function keepDir() {
	return process.env.FINAL_SYNC_DIR || path.join(process.env.MIGRATE_STATE_DIR || '/tmp/expedition-migrate', 'final-sync');
}

async function dumpSource(sourceUrl, dumpPath) {
	console.log('final-sync: (a) pg_dump schema public, read-only, same filter as initial-load');
	const source = await openReadOnly(sourceUrl, 'source');
	await source.end();
	await run(
		'pg_dump',
		[
			'--schema=public',
			'--no-owner',
			'--no-acl',
			'--no-comments',
			'--rows-per-insert=100',
			'--encoding=UTF8',
			'--file',
			dumpPath
		],
		libpqEnv(sourceUrl, readOnlyPgEnv())
	);
	const info = await stat(dumpPath);
	if (!info.size) throw new Error('pg_dump wrote an empty file');
	console.log(`dump kept at ${dumpPath} (${info.size} bytes). Supabase was not modified.`);
}

async function preflight(dumpPath) {
	let statements = 0;
	const changes = await streamSanitizeFile(dumpPath, async () => {
		statements++;
	});
	if (!statements) throw new Error('filtered dump has no statements; refusing to replace the target');
	const dropped = changes.filter((change) => change.action === 'drop').length;
	const rewritten = changes.filter((change) => change.action === 'rewrite').length;
	console.log(`dump filter: ${statements} statements, ${rewritten} rewritten, ${dropped} dropped`);
	return statements;
}

async function terminateOtherSessions(targetUrl) {
	const client = new pg.Client({
		connectionString: targetUrl,
		application_name: 'expedition-final-sync'
	});
	await client.connect();
	try {
		const killed = await client.query(`
			select count(*) filter (where pg_terminate_backend(pid))::int as n
			from pg_stat_activity
			where datname = current_database()
			  and pid <> pg_backend_pid()
			  and backend_type = 'client backend'
		`);
		console.log(
			`terminated ${killed.rows[0].n} other sessions on the target. Restart PostgREST after final-sync so it reconnects.`
		);
	} catch (error) {
		console.log(`could not terminate other sessions (${error.message}). The drop waits up to the lock timeout.`);
	} finally {
		await client.end();
	}
}

/** Filtered dump, with the schema replace in the same file. psql -1 runs it as one transaction. */
async function writeReplaceScript(dumpPath, scriptPath) {
	const stream = createWriteStream(scriptPath);
	const write = async (text) => {
		if (!stream.write(text)) await once(stream, 'drain');
	};
	await write("SET lock_timeout = '20s';\nDROP SCHEMA IF EXISTS public CASCADE;\nCREATE SCHEMA public;\nSET search_path TO public;\n");
	let n = 0;
	await streamSanitizeFile(dumpPath, async (statement) => {
		const suffix = statement.includes('\n\\.') ? '\n' : ';\n';
		await write(statement + suffix);
		n++;
		if (n % 200 === 0) console.log(`  filtered ${n} statements`);
	});
	stream.end();
	await once(stream, 'finish');
	console.log(`filtered restore script kept at ${scriptPath} (${n} statements)`);
}

async function replacePublic(targetUrl, scriptPath) {
	await terminateOtherSessions(targetUrl);
	console.log('final-sync: (b) dropping schema public on the target and restoring the filtered dump');
	console.log('psql -1 (one transaction; a statement error rolls the drop back)');
	await run('psql', ['-1', '-v', 'ON_ERROR_STOP=1', '-f', scriptPath], libpqEnv(targetUrl));
	console.log('COMMIT replace done. A later failure does not undo the restored schema.');
}

async function postLoad(targetUrl) {
	console.log('final-sync: (c) files table, then post-load (roles.sql and sequence print)');
	const client = new pg.Client({
		connectionString: targetUrl,
		application_name: 'expedition-final-sync-files'
	});
	await client.connect();
	try {
		const sql = await readFile(filesSqlPath, 'utf8');
		await client.query(sql);
	} finally {
		await client.end();
	}
	await run(process.execPath, [postLoadScript], {
		...process.env,
		DATABASE_URL: targetUrl,
		TARGET_DATABASE_URL: targetUrl
	});
}

export async function finalSync({ sourceUrl, targetUrl, supabaseUrl, serviceRoleKey }) {
	if (!sourceUrl) throw new Error('SOURCE_DATABASE_URL is required');
	if (!targetUrl) throw new Error('DATABASE_URL is required');
	if (!supabaseUrl || !serviceRoleKey) {
		throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (list and download only)');
	}
	assertOrchardTarget(targetUrl);

	const dir = keepDir();
	await mkdir(dir, { recursive: true });
	const dumpPath = path.join(dir, 'public.sql');

	try {
		await dumpSource(sourceUrl, dumpPath);
		await preflight(dumpPath);
	} catch (error) {
		console.error(error.message || error);
		console.error('final-sync: target schema was not modified');
		console.log('final-sync: FAILED');
		return 1;
	}
	console.log('dump and filter succeeded. The target has not been modified yet.');

	let replaced = false;
	try {
			const scriptPath = path.join(dir, 'replace.sql');
		await writeReplaceScript(dumpPath, scriptPath);
		await replacePublic(targetUrl, scriptPath);
	} catch (error) {
		console.error(error.message || error);
		console.error('final-sync: replace rolled back. The previous public schema is still there.');
		console.log('final-sync: FAILED');
		return 1;
	}
	replaced = true;

	try {
		await postLoad(targetUrl);
		console.log('final-sync: (d) copy-storage (read-only on Supabase)');
		await copyStorage({ targetUrl, supabaseUrl, serviceRoleKey });
		console.log('final-sync: (e) verify');
		const result = await verifyPair({ sourceUrl, targetUrl, supabaseUrl, serviceRoleKey });
		printReport(result);
		if (!result.ok) {
			console.log('final-sync: FAILED');
			console.log('Restart the PostgREST app. The target schema was replaced and verify did not match.');
			return 1;
		}
		console.log('final-sync: OK');
		console.log('Restart the PostgREST app so it reloads the schema. Then turn MAINTENANCE_MODE off.');
		return 0;
	} catch (error) {
		console.error(error.message || error);
		console.log('final-sync: FAILED');
		if (replaced) {
			console.log('The target schema was replaced. Restart PostgREST. Fix the error and set MIGRATE_RERUN=1 to run final-sync again.');
		}
		return 1;
	}
}

const isMain = process.argv[1] && process.argv[1].endsWith('final-sync.mjs');
if (isMain) {
	const args = parseArgs(process.argv.slice(2));
	finalSync({
		sourceUrl: sourceUrlFrom(args),
		targetUrl: targetUrlFrom(args),
		supabaseUrl: supabaseUrlFrom(args),
		serviceRoleKey: serviceRoleFrom(args)
	})
		.then((code) => process.exit(code))
		.catch((error) => {
			console.error(error.message || error);
			console.log('final-sync: FAILED');
			process.exit(1);
		});
}
