#!/usr/bin/env node
/**
 * One-shot load of Supabase schema public into the empty Orchard database.
 *
 *   initial-load
 *
 * SOURCE_DATABASE_URL  Supabase session pooler (read-only). Not port 6543.
 * DATABASE_URL         Orchard binding (transaction pooler is fine).
 *
 * pg_dump is schema public only, --no-owner --no-acl. Extensions other than
 * pgcrypto, uuid-ossp, and plpgsql are removed. Public objects that reference
 * auth, storage, vault, graphql, or realtime are rewritten or dropped, and
 * every such change is printed. The target must have an empty public schema.
 * roles.sql is applied after the restore. Table counts, order-sensitive md5s
 * from verify's snapshot, and sequence values are printed against the source.
 *
 * Nothing here writes to Supabase. The source session is read-only.
 */
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
	assertCanWriteSchema,
	assertRestoreTarget,
	databaseSnapshot,
	diffSnapshots,
	libpqEnv,
	openReadOnly,
	parseArgs,
	publicShape,
	readOnlyPgEnv,
	run,
	shapeIsEmpty,
	sourceUrlFrom,
	targetUrlFrom
} from './lib.mjs';
import { sanitizeDump } from './sanitize-dump.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const rolesSql = path.resolve(here, '../../deploy/postgrest/roles.sql');

function preview(sql) {
	return sql.replace(/\s+/g, ' ').slice(0, 160);
}

async function execRestore(targetUrl, statements) {
	const client = new pg.Client({
		connectionString: targetUrl,
		application_name: 'expedition-initial-load',
		statement_timeout: 0
	});
	await client.connect();
	try {
		// One transaction pins a single server connection on Orchard's
		// transaction-mode pooler, so the load is all-or-nothing.
		await client.query('begin');
		let n = 0;
		for (const statement of statements) {
			try {
				await client.query(statement);
			} catch (error) {
				await client.query('rollback').catch(() => {});
				throw new Error(`restore failed (${n + 1}/${statements.length}): ${error.message}\n  ${preview(statement)}`);
			}
			n++;
			if (n % 200 === 0) console.log(`  restored ${n}/${statements.length} statements`);
		}
		await client.query('commit');
		console.log(`restored ${statements.length} statements`);
	} finally {
		await client.end();
	}
}

function printReport(changes) {
	const dropped = changes.filter((change) => change.action === 'drop');
	const rewritten = changes.filter((change) => change.action === 'rewrite');
	console.log(`dump filter: ${rewritten.length} rewritten, ${dropped.length} dropped`);
	for (const change of changes) {
		const label = change.name ? `${change.kind} ${change.name}` : change.kind;
		console.log(`  ${change.action.toUpperCase()} ${label}: ${change.reason}`);
		console.log(`    ${change.preview}`);
	}
}

function printCompare(source, target, mismatches) {
	console.log('per-table count and md5 (source -> target):');
	const targetByName = new Map(target.tables.map((row) => [row.name, row]));
	for (const row of source.tables) {
		const other = targetByName.get(row.name);
		console.log(
			`  ${row.name}: count ${row.count} md5 ${row.md5} -> count ${other?.count ?? 'missing'} md5 ${other?.md5 ?? 'missing'}`
		);
	}
	console.log('sequences (source -> target):');
	const targetSeq = new Map(target.sequences.map((row) => [row.name, row]));
	for (const row of source.sequences) {
		const other = targetSeq.get(row.name);
		console.log(
			`  ${row.name}: last_value ${row.last_value} is_called ${row.is_called} -> last_value ${other?.last_value ?? 'missing'} is_called ${other?.is_called ?? 'missing'}`
		);
	}
	console.log(`functions ${source.functions} -> ${target.functions}, triggers ${source.triggers} -> ${target.triggers}`);
	if (mismatches.length) {
		console.log('mismatches:');
		for (const line of mismatches) console.log(`  ${line}`);
	}
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const sourceUrl = sourceUrlFrom(args);
	const targetUrl = targetUrlFrom(args);
	if (!sourceUrl || !targetUrl || args.help) {
		console.error('Usage: initial-load   (SOURCE_DATABASE_URL and DATABASE_URL)');
		process.exit(2);
	}
	assertRestoreTarget(targetUrl);

	console.log('checking the source session is read-only');
	const source = await openReadOnly(sourceUrl, 'source');
	await source.end();

	const admin = new pg.Client({ connectionString: targetUrl, application_name: 'expedition-initial-load' });
	await admin.connect();
	try {
		await assertCanWriteSchema(admin, 'target');
		const shape = await publicShape(admin);
		if (!shapeIsEmpty(shape)) {
			throw new Error(
				`target schema public is not empty (${shape.tables} tables, ${shape.views} views, ${shape.sequences} sequences, ${shape.functions} functions). initial-load refuses to overwrite it.`
			);
		}
	} finally {
		await admin.end();
	}

	const dir = await mkdtemp(path.join(tmpdir(), 'expedition-initial-'));
	const dumpPath = path.join(dir, 'public.sql');
	const cleanPath = path.join(dir, 'public.cleaned.sql');
	console.log('pg_dump schema public (read-only, --no-owner --no-acl, inserts)');
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

	const raw = await readFile(dumpPath, 'utf8');
	const sanitized = sanitizeDump(raw);
	await writeFile(cleanPath, sanitized.sql);
	printReport(sanitized.changes);
	console.log(`cleaned dump: ${cleanPath}`);

	console.log('restoring into the empty Orchard database');
	await execRestore(targetUrl, sanitized.statements);

	console.log('applying deploy/postgrest/roles.sql');
	const roleArgs = ['-v', 'ON_ERROR_STOP=1', '-f', rolesSql];
	if (process.env.AUTHENTICATOR_PASSWORD) {
		roleArgs.unshift('-v', `authenticator_password=${process.env.AUTHENTICATOR_PASSWORD}`);
	}
	await run('psql', roleArgs, libpqEnv(targetUrl));

	console.log('comparing public data to the source');
	const sourceDb = await openReadOnly(sourceUrl, 'source');
	const targetDb = await openReadOnly(targetUrl, 'target');
	let mismatches = [];
	try {
		const sourceSnap = await databaseSnapshot(sourceDb);
		const targetSnap = await databaseSnapshot(targetDb);
		mismatches = diffSnapshots(sourceSnap, targetSnap);
		printCompare(sourceSnap, targetSnap, mismatches);
	} finally {
		await sourceDb.end();
		await targetDb.end();
	}

	const dropped = sanitized.changes.some((change) => change.action === 'drop' && change.kind !== 'set' && change.kind !== 'meta' && change.kind !== 'schema');
	const dataMismatches = mismatches.filter((line) => !line.startsWith('functions:') && !line.startsWith('triggers:'));
	const structureMismatches = mismatches.filter((line) => line.startsWith('functions:') || line.startsWith('triggers:'));
	if (dataMismatches.length) {
		console.error('initial-load data verify failed');
		process.exit(1);
	}
	if (structureMismatches.length && !dropped) {
		console.error('function or trigger counts differ and nothing was dropped to explain it');
		process.exit(1);
	}
	if (structureMismatches.length) {
		console.log('function/trigger counts differ because Supabase-only objects were dropped. Table data and sequences match.');
	} else {
		console.log('verify: table counts, md5s, sequences, functions, and triggers match');
	}
	console.log('next: copy-storage, then verify (that step includes Storage files)');
}

const isMain = process.argv[1] && process.argv[1].endsWith('initial-load.mjs');
if (isMain) {
	main().catch((error) => {
		console.error(error.message || error);
		process.exit(1);
	});
}
