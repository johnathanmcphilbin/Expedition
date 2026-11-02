#!/usr/bin/env node
/**
 * FINAL step, weeks after cutover. Deletes Expedition data from Supabase.
 *
 * This file is never imported. Running it requires both
 *   --confirm-decommission
 * and
 *   --project-ref ulmowedmbobncmcriszs
 *
 * Before anything is deleted it re-runs verify against the live Orchard
 * database and aborts on any mismatch, takes a last pg_dump plus Storage
 * tarball, checksums them, and restores the dump into a localhost database
 * named expedition_decommission_scratch. Only then does it delete Storage
 * objects and buckets and drop schema public on the source.
 *
 * A failed run that already wrote DECOMMISSION_AUTHORIZED.json can be
 * continued with --resume-backup <dir>. That path does not trust the live
 * source (it may already be partial); it re-checks the backup checksums and
 * the scratch restore against the snapshot taken when deletion was authorized.
 *
 * Pausing or deleting the Supabase project is not done here.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import {
	BUCKETS,
	PROJECT_REF,
	databaseSnapshot,
	diffFiles,
	diffSnapshots,
	md5Buffer,
	parseArgs,
	run,
	serviceRoleFrom,
	sha256File,
	sourceUrlFrom,
	supabaseUrlFrom,
	targetUrlFrom
} from './lib.mjs';
import { restoreDump } from './restore-target.mjs';
import { verifyPair } from './verify.mjs';

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url !== entry) {
	throw new Error('scripts/migrate/decommission-supabase must be executed directly and never imported');
}

function fail(message, code = 1) {
	console.error(message);
	process.exit(code);
}

function assertDecommissionSource(url) {
	const text = (url || '').toLowerCase();
	if (!text.includes(PROJECT_REF)) fail(`source URL must contain the project ref ${PROJECT_REF}`, 2);
	if (!text.includes('supabase.co') && !text.includes('supabase.com')) {
		fail('source URL must be a Supabase host. Refusing to delete anything else.', 2);
	}
}

function assertScratch(url) {
	let parsed;
	try {
		parsed = new URL(url);
	} catch {
		fail('SCRATCH_DATABASE_URL is not a URL', 2);
	}
	if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
		fail('scratch database must be on localhost so the proof restore cannot land on a remote server', 2);
	}
	const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
	if (name !== 'expedition_decommission_scratch') {
		fail('scratch database must be named expedition_decommission_scratch', 2);
	}
}

async function filesInTar(tarPath) {
	const dir = path.join(tmpdir(), `expedition-tar-${Date.now()}`);
	await mkdir(dir, { recursive: true });
	await run('tar', ['-xzf', tarPath, '-C', dir]);
	const found = [];
	async function walk(bucket, rel) {
		const { readdir, readFile, stat } = await import('node:fs/promises');
		const abs = path.join(dir, bucket, rel);
		let entries = [];
		try {
			entries = await readdir(abs);
		} catch {
			return;
		}
		for (const name of entries) {
			const child = rel ? `${rel}/${name}` : name;
			const st = await stat(path.join(abs, name));
			if (st.isDirectory()) await walk(bucket, child);
			else {
				const bytes = await readFile(path.join(abs, name));
				found.push({ bucket, path: child, size: bytes.length, md5: md5Buffer(bytes) });
			}
		}
	}
	for (const bucket of BUCKETS) await walk(bucket, '');
	found.sort((a, b) => a.bucket.localeCompare(b.bucket) || a.path.localeCompare(b.path));
	return found;
}

async function proveBackup({ dumpPath, tarPath, snapshot, scratchUrl }) {
	assertScratch(scratchUrl);
	await restoreDump({ targetUrl: scratchUrl, dumpPath, fresh: true });
	const { openReadOnly } = await import('./lib.mjs');
	const scratch = await openReadOnly(scratchUrl, 'scratch');
	try {
		const restored = await databaseSnapshot(scratch);
		const mismatches = diffSnapshots(
			{
				tables: snapshot.tables,
				sequences: snapshot.sequences,
				functions: snapshot.functions,
				triggers: snapshot.triggers
			},
			restored
		);
		if (mismatches.length) {
			fail(`scratch restore does not match the backup snapshot:\n${mismatches.join('\n')}`);
		}
	} finally {
		await scratch.end();
	}
	const extracted = await filesInTar(tarPath);
	const fileMismatches = diffFiles(snapshot.files, extracted);
	if (fileMismatches.length) {
		fail(`storage tarball does not match the backup snapshot:\n${fileMismatches.join('\n')}`);
	}
}

async function deleteStorage(supabaseUrl, serviceRoleKey) {
	const { createSourceStorage } = await import('./lib.mjs');
	const storage = createSourceStorage({ supabaseUrl, serviceRoleKey });
	const base = supabaseUrl.replace(/\/+$/, '');
	const headers = {
		Authorization: `Bearer ${serviceRoleKey}`,
		apikey: serviceRoleKey,
		'Content-Type': 'application/json'
	};
	for (const bucket of BUCKETS) {
		const objects = await storage.listBucket(bucket);
		for (let i = 0; i < objects.length; i += 100) {
			const prefixes = objects.slice(i, i + 100).map((object) => object.path);
			const response = await fetch(`${base}/storage/v1/object/${encodeURIComponent(bucket)}`, {
				method: 'DELETE',
				headers,
				body: JSON.stringify({ prefixes })
			});
			if (!response.ok) {
				fail(`storage delete failed for ${bucket}: ${response.status} ${(await response.text()).slice(0, 300)}`);
			}
		}
		const left = await storage.listBucket(bucket);
		if (left.length) fail(`bucket ${bucket} still has ${left.length} objects after delete`);
		const removed = await fetch(`${base}/storage/v1/bucket/${encodeURIComponent(bucket)}`, {
			method: 'DELETE',
			headers
		});
		if (!removed.ok && removed.status !== 404) {
			fail(`bucket delete failed for ${bucket}: ${removed.status} ${(await removed.text()).slice(0, 300)}`);
		}
		console.log(`deleted bucket ${bucket} (${objects.length} objects)`);
	}
}

async function dropPublic(sourceUrl) {
	const client = new pg.Client({
		connectionString: sourceUrl,
		application_name: 'expedition-decommission-write'
	});
	await client.connect();
	try {
		await client.query('drop schema if exists public cascade');
		await client.query('create schema public');
		await client.query(`
			do $do$
			declare role_name text;
			begin
			  foreach role_name in array array['postgres', 'anon', 'authenticated', 'service_role']
			  loop
			    if exists (select 1 from pg_roles where rolname = role_name) then
			      execute format('grant usage, create on schema public to %I', role_name);
			    end if;
			  end loop;
			end
			$do$;
		`);
	} finally {
		await client.end();
	}
}

const args = parseArgs(process.argv.slice(2));
if (args['confirm-decommission'] !== true || args['project-ref'] !== PROJECT_REF) {
	fail(
		`Refusing to run. Pass --confirm-decommission and --project-ref ${PROJECT_REF}. This deletes Supabase data.`,
		2
	);
}

const sourceUrl = sourceUrlFrom(args);
const targetUrl = targetUrlFrom(args);
const supabaseUrl = supabaseUrlFrom(args);
const serviceRoleKey = serviceRoleFrom(args);
const scratchUrl = args['scratch-url'] || process.env.SCRATCH_DATABASE_URL;
assertDecommissionSource(sourceUrl);
if (!targetUrl) fail('DATABASE_URL / TARGET_DATABASE_URL (the Orchard database) is required', 2);
if (!scratchUrl) fail('SCRATCH_DATABASE_URL is required', 2);
assertScratch(scratchUrl);

const resume = args['resume-backup'];
let snapshot;
let dumpPath;
let tarPath;

if (resume) {
	const stamp = JSON.parse(await readFile(path.join(resume, 'DECOMMISSION_AUTHORIZED.json'), 'utf8'));
	if (stamp.project_ref !== PROJECT_REF) fail('backup stamp is for a different project');
	dumpPath = path.join(resume, 'public.dump');
	tarPath = path.join(resume, 'storage.tar.gz');
	const dumpHash = await sha256File(dumpPath);
	const tarHash = await sha256File(tarPath);
	if (dumpHash !== stamp.dump_sha256 || tarHash !== stamp.storage_sha256) {
		fail('backup checksums do not match DECOMMISSION_AUTHORIZED.json');
	}
	snapshot = stamp.snapshot;
	console.log('resume: backup checksums match the authorized snapshot');
	await proveBackup({ dumpPath, tarPath, snapshot, scratchUrl });
} else {
	console.log('verify source against Orchard before any delete');
	const result = await verifyPair({ sourceUrl, targetUrl, supabaseUrl, serviceRoleKey });
	if (!result.ok) {
		console.error(result.mismatches.join('\n'));
		fail('verify failed. Nothing was deleted.');
	}
	const out = path.resolve(args.out || `backups/decommission-${new Date().toISOString().replace(/[:.]/g, '')}`);
	await mkdir(out, { recursive: true });
	console.log(`last backup -> ${out}`);
	await run(process.execPath, [path.join(path.dirname(process.argv[1]), 'backup-source.mjs'), '--out', out], process.env);
	dumpPath = path.join(out, 'public.dump');
	tarPath = path.join(out, 'storage.tar.gz');
	const stamp = {
		project_ref: PROJECT_REF,
		created_at: new Date().toISOString(),
		dump_sha256: await sha256File(dumpPath),
		storage_sha256: await sha256File(tarPath),
		snapshot: result.snapshot
	};
	await proveBackup({ dumpPath, tarPath, snapshot: result.snapshot, scratchUrl });
	await writeFile(path.join(out, 'DECOMMISSION_AUTHORIZED.json'), JSON.stringify(stamp, null, 2));
	console.log('scratch restore matches. Deletion is authorized.');
}

console.log('deleting Storage objects and buckets on the source');
await deleteStorage(supabaseUrl, serviceRoleKey);
console.log('dropping schema public on the source');
await dropPublic(sourceUrl);
console.log('Supabase public data and the three Storage buckets are gone.');
console.log('The Supabase project itself was not paused or deleted. That is a dashboard step.');
console.log('auth, storage, and other Supabase-managed schemas were not dropped.');
