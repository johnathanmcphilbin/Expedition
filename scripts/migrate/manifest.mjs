#!/usr/bin/env node
/**
 * Order-independent data manifest.
 *
 *   manifest-emit  --out manifest.json     # read-only, SOURCE_DATABASE_URL or DATABASE_URL
 *   manifest-check --manifest manifest.json  # read-only, DATABASE_URL
 *
 * Each table is count + md5 of per-row md5s sorted, so physical row order
 * does not matter. Sequences are last_value and is_called. Files are
 * bucket, path, size, and sha256. Nothing is written to either database.
 * A Supabase URL is only ever opened read-only.
 */
import { readFile, writeFile } from 'node:fs/promises';
import {
	fileSha256Manifest,
	fingerprintSequences,
	fingerprintTableUnordered,
	openReadOnly,
	parseArgs,
	tableNames,
	FILES_TABLE,
	sourceUrlFrom,
	targetUrlFrom
} from './lib.mjs';

async function snapshot(connectionString, label) {
	const client = await openReadOnly(connectionString, label);
	try {
		const names = (await tableNames(client)).filter((name) => name !== FILES_TABLE);
		const tables = [];
		for (const name of names) tables.push(await fingerprintTableUnordered(client, name));
		return {
			created_at: new Date().toISOString(),
			tables,
			sequences: await fingerprintSequences(client),
			files: await fileSha256Manifest(client)
		};
	} finally {
		await client.end();
	}
}

function compare(manifest, live) {
	const mismatches = [];
	const liveTables = new Map(live.tables.map((row) => [row.name, row]));
	const wantTables = new Map(manifest.tables.map((row) => [row.name, row]));
	for (const [name, row] of wantTables) {
		const other = liveTables.get(name);
		if (!other) {
			mismatches.push(`table ${name}: missing`);
			continue;
		}
		if (row.count !== other.count) mismatches.push(`table ${name}: count ${row.count} != ${other.count}`);
		if (row.md5 !== other.md5) mismatches.push(`table ${name}: md5 ${row.md5} != ${other.md5}`);
	}
	for (const name of liveTables.keys()) {
		if (!wantTables.has(name)) mismatches.push(`table ${name}: not in the manifest`);
	}
	const liveSeq = new Map(live.sequences.map((row) => [row.name, row]));
	const wantSeq = new Map(manifest.sequences.map((row) => [row.name, row]));
	for (const [name, row] of wantSeq) {
		const other = liveSeq.get(name);
		if (!other) {
			mismatches.push(`sequence ${name}: missing`);
			continue;
		}
		if (String(row.last_value) !== String(other.last_value) || row.is_called !== other.is_called) {
			mismatches.push(`sequence ${name}: ${row.last_value}/${row.is_called} != ${other.last_value}/${other.is_called}`);
		}
	}
	const liveFiles = new Map(live.files.map((row) => [`${row.bucket}\0${row.path}`, row]));
	const wantFiles = new Map((manifest.files ?? []).map((row) => [`${row.bucket}\0${row.path}`, row]));
	if (wantFiles.size !== liveFiles.size) mismatches.push(`files: count ${wantFiles.size} != ${liveFiles.size}`);
	for (const [id, row] of wantFiles) {
		const other = liveFiles.get(id);
		if (!other) {
			mismatches.push(`file ${row.bucket}/${row.path}: missing`);
			continue;
		}
		if (row.size !== other.size) mismatches.push(`file ${row.bucket}/${row.path}: size ${row.size} != ${other.size}`);
		if (row.sha256 !== other.sha256) mismatches.push(`file ${row.bucket}/${row.path}: sha256 mismatch`);
	}
	for (const [id, row] of liveFiles) {
		if (!wantFiles.has(id)) mismatches.push(`file ${row.bucket}/${row.path}: not in the manifest`);
	}
	return mismatches;
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0];

if (command === 'emit') {
	const connection = args['source-url'] || sourceUrlFrom(args) || targetUrlFrom(args);
	const out = args.out;
	if (!connection || !out) {
		console.error('Usage: manifest.mjs emit --out manifest.json');
		process.exit(2);
	}
	const snap = await snapshot(connection, 'manifest-source');
	await writeFile(out, JSON.stringify(snap, null, 2));
	console.log(`wrote ${out}: ${snap.tables.length} tables, ${snap.sequences.length} sequences, ${snap.files.length} files`);
} else if (command === 'check') {
	const connection = targetUrlFrom(args);
	const file = args.manifest;
	if (!connection || !file) {
		console.error('Usage: manifest.mjs check --manifest manifest.json');
		process.exit(2);
	}
	const manifest = JSON.parse(await readFile(file, 'utf8'));
	const live = await snapshot(connection, 'manifest-target');
	const mismatches = compare(manifest, live);
	console.log(`checked ${live.tables.length} tables, ${live.sequences.length} sequences, ${live.files.length} files`);
	if (mismatches.length) {
		for (const line of mismatches) console.error(`  ${line}`);
		process.exit(1);
	}
	console.log('manifest: OK, zero mismatches');
} else {
	console.error('Usage: manifest.mjs emit --out file.json | manifest.mjs check --manifest file.json');
	process.exit(2);
}
