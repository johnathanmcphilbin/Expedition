#!/usr/bin/env node
/**
 * Copy every Storage object from the three buckets into public.files on the
 * TARGET. Idempotent: a row with the same size, sha256, and content_type is
 * left alone, so a later run only writes the delta.
 *
 * The summary separates four cases the old "unchanged" counter mixed together.
 * unchanged incremented whenever a SELECT found a matching row. On one run
 * that happens in exactly two ways: this process already inserted that path
 * (the list returned it twice), or another copy-storage inserted it first.
 * It was not a comparison of the download against itself. The row count at
 * the start of the run was not logged, so a live "unchanged" line cannot
 * tell those two apart. This script logs them separately.
 *
 * Storage access is list and download only. The source database is not opened.
 * The target URL is refused if it looks like Supabase. Hashing streams. Bytes
 * are buffered only for the one object being inserted or updated.
 *
 *   node scripts/migrate/copy-storage.mjs
 *
 * Environment: TARGET_DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
	BUCKETS,
	assertCanWriteSchema,
	assertRestoreTarget,
	contentTypeOf,
	createSourceStorage,
	parseArgs,
	serviceRoleFrom,
	supabaseUrlFrom,
	targetUrlFrom
} from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const filesSql = path.resolve(here, '../../supabase/migrations/0046_files.sql');

function sameRow(row, hashed, contentType) {
	return row && Number(row.size) === hashed.size && row.sha256 === hashed.sha256 && row.content_type === contentType;
}

export async function copyStorage({ targetUrl, supabaseUrl, serviceRoleKey }) {
	assertRestoreTarget(targetUrl);
	const storage = createSourceStorage({ supabaseUrl, serviceRoleKey });
	const target = new pg.Client({
		connectionString: targetUrl,
		application_name: 'expedition-migrate-files'
	});
	await target.connect();
	let inserted = 0;
	let updated = 0;
	let alreadyStored = 0;
	let concurrent = 0;
	let duplicateListings = 0;
	let unique = 0;
	let rowsAtStart = 0;
	let rowsAtEnd = 0;
	try {
		await assertCanWriteSchema(target, 'target');
		const sql = await readFile(filesSql, 'utf8');
		await target.query(sql);
		const started = await target.query(`select bucket, path from public.files`);
		rowsAtStart = started.rows.length;
		const priorKeys = new Set(started.rows.map((row) => `${row.bucket}\0${row.path}`));
		for (const bucket of BUCKETS) {
			const objects = await storage.listBucket(bucket);
			duplicateListings += objects.duplicateListings;
			unique += objects.length;
			console.log(
				`${bucket}: listed ${objects.listed}, unique ${objects.length}, duplicate listings ${objects.duplicateListings}`
			);
			for (const object of objects) {
				const key = `${bucket}\0${object.path}`;
				const hadRowAtStart = priorKeys.has(key);
				// Re-runs hash without holding the body. A new or changed object
				// is downloaded once, into a buffer for that object only.
				const hashed = hadRowAtStart
					? await storage.hashObject(bucket, object.path)
					: await storage.download(bucket, object.path);
				const contentType = contentTypeOf(object.metadata?.mimetype, hashed.contentType);
				const existing = await target.query(
					`select size::bigint as size, encode(sha256(bytes), 'hex') as sha256, content_type
					 from public.files where bucket = $1 and path = $2`,
					[bucket, object.path]
				);
				const row = existing.rows[0];
				if (sameRow(row, hashed, contentType)) {
					if (hadRowAtStart) alreadyStored++;
					else concurrent++;
					continue;
				}
				const downloaded = hashed.bytes ? hashed : await storage.download(bucket, object.path);
				if (downloaded.sha256 !== hashed.sha256 || downloaded.size !== hashed.size) {
					throw new Error(`sha256 changed between reads of ${bucket}/${object.path}`);
				}
				const written = await target.query(
					`insert into public.files (bucket, path, content_type, size, bytes)
					 values ($1, $2, $3, $4, $5)
					 on conflict (bucket, path) do update
					 set content_type = excluded.content_type,
					     size = excluded.size,
					     bytes = excluded.bytes
					 returning (xmax = 0) as inserted`,
					[bucket, object.path, contentType, downloaded.size, downloaded.bytes]
				);
				// xmax = 0 means this statement inserted the row. A conflict means
				// the row appeared after the snapshot (another copy-storage) or
				// the bytes changed.
				if (written.rows[0].inserted) inserted++;
				else updated++;
			}
		}
		const ended = await target.query(`select count(*)::bigint as n from public.files`);
		rowsAtEnd = Number(ended.rows[0].n);
	} finally {
		await target.end();
	}
	console.log(
		`files: rows at start ${rowsAtStart}, rows at end ${rowsAtEnd}, unique ${unique}, inserted ${inserted}, updated ${updated}, already stored ${alreadyStored}, concurrent ${concurrent}, duplicate listings ${duplicateListings}`
	);
	console.log(
		'files note: already stored = the row existed before this process started and size, sha256, and content_type matched. concurrent = the row was absent at start but matched when this process reached it, so another copy-storage wrote it. duplicate listings = the storage list returned that path more than once; it is stored once. The old unchanged counter incremented for either of those, which is why a first run into an empty table could print unchanged.'
	);
	return { inserted, updated, alreadyStored, concurrent, duplicateListings, rowsAtStart, rowsAtEnd, unique };
}

const isMain = process.argv[1] && process.argv[1].endsWith('copy-storage.mjs');
if (isMain) {
	const args = parseArgs(process.argv.slice(2));
	const targetUrl = targetUrlFrom(args);
	const supabaseUrl = supabaseUrlFrom(args);
	const serviceRoleKey = serviceRoleFrom(args);
	if (!targetUrl || args.help) {
		console.error('Usage: node scripts/migrate/copy-storage.mjs');
		process.exit(2);
	}
	copyStorage({ targetUrl, supabaseUrl, serviceRoleKey }).catch((error) => {
		console.error(error.message || error);
		process.exit(1);
	});
}
