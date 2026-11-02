#!/usr/bin/env node
/**
 * Copy every Storage object from the three buckets into public.files on the
 * TARGET. Idempotent: a row with the same size and md5 is left alone, so a
 * later run only writes the delta.
 *
 * Storage access is list and download only. The source database is not opened.
 * The target URL is refused if it looks like Supabase.
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
	createSourceStorage,
	parseArgs,
	serviceRoleFrom,
	supabaseUrlFrom,
	targetUrlFrom
} from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const filesSql = path.resolve(here, '../../supabase/migrations/0046_files.sql');

function contentTypeOf(object, downloaded) {
	const raw = object.metadata?.mimetype || downloaded.contentType || 'application/octet-stream';
	return raw.split(';')[0].trim() || 'application/octet-stream';
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
	let unchanged = 0;
	try {
		await assertCanWriteSchema(target, 'target');
		const sql = await readFile(filesSql, 'utf8');
		await target.query(sql);
		for (const bucket of BUCKETS) {
			const objects = await storage.listBucket(bucket);
			console.log(`${bucket}: ${objects.length} objects`);
			for (const object of objects) {
				const downloaded = await storage.download(bucket, object.path);
				const contentType = contentTypeOf(object, downloaded);
				const existing = await target.query(
					`select size::bigint as size, md5(bytes) as md5, content_type
					 from public.files where bucket = $1 and path = $2`,
					[bucket, object.path]
				);
				const row = existing.rows[0];
				if (row && Number(row.size) === downloaded.size && row.md5 === downloaded.md5 && row.content_type === contentType) {
					unchanged++;
					continue;
				}
				await target.query(
					`insert into public.files (bucket, path, content_type, size, bytes)
					 values ($1, $2, $3, $4, $5)
					 on conflict (bucket, path) do update
					 set content_type = excluded.content_type,
					     size = excluded.size,
					     bytes = excluded.bytes`,
					[bucket, object.path, contentType, downloaded.size, downloaded.bytes]
				);
				if (row) updated++;
				else inserted++;
			}
		}
	} finally {
		await target.end();
	}
	return { inserted, updated, unchanged };
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
	copyStorage({ targetUrl, supabaseUrl, serviceRoleKey })
		.then((result) => console.log(`files: ${result.inserted} inserted, ${result.updated} updated, ${result.unchanged} unchanged`))
		.catch((error) => {
			console.error(error.message || error);
			process.exit(1);
		});
}
