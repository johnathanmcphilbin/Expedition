#!/usr/bin/env node
/**
 * First step of the cutover, and safe to re-run.
 *
 * Reads the source database (read-only session) and Storage (list + download
 * only). Writes a pg_dump of schema public and a tarball of every object in
 * the three buckets, plus SHA256 checksums. Does not modify the source.
 *
 *   node scripts/migrate/backup-source.mjs --out backups/2026-01-01T000000Z
 *
 * Environment (flags override):
 *   SOURCE_DATABASE_URL
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
	BUCKETS,
	createSourceStorage,
	libpqEnv,
	md5Buffer,
	openReadOnly,
	parseArgs,
	readOnlyPgEnv,
	run,
	serviceRoleFrom,
	sha256File,
	sourceUrlFrom,
	supabaseUrlFrom
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const sourceUrl = sourceUrlFrom(args);
const supabaseUrl = supabaseUrlFrom(args);
const serviceRoleKey = serviceRoleFrom(args);
const outDir = args.out;

if (!outDir || args.help) {
	console.error('Usage: node scripts/migrate/backup-source.mjs --out <directory>');
	process.exit(2);
}

const source = await openReadOnly(sourceUrl, 'source');
try {
	await mkdir(outDir, { recursive: true });
	const dumpPath = path.resolve(outDir, 'public.dump');
	console.log('pg_dump schema public (read-only session)');
	await run(
		'pg_dump',
		['--format=custom', '--schema=public', '--no-owner', '--no-privileges', '--file', dumpPath],
		libpqEnv(sourceUrl, readOnlyPgEnv())
	);

	const storage = createSourceStorage({ supabaseUrl, serviceRoleKey });
	const staging = path.join(tmpdir(), `expedition-storage-${Date.now()}`);
	await mkdir(staging, { recursive: true });
	const manifest = [];
	for (const bucket of BUCKETS) {
		const objects = await storage.listBucket(bucket);
		console.log(
			`${bucket}: listed ${objects.listed}, unique ${objects.length}, duplicate listings ${objects.duplicateListings}`
		);
		for (const object of objects) {
			const file = await storage.download(bucket, object.path);
			const rel = path.join(bucket, object.path);
			const dest = path.join(staging, rel);
			await mkdir(path.dirname(dest), { recursive: true });
			await writeFile(dest, file.bytes);
			const contentType = (object.metadata?.mimetype || file.contentType || 'application/octet-stream').split(';')[0].trim();
			manifest.push({
				bucket,
				path: object.path,
				size: file.size,
				md5: file.md5,
				content_type: contentType
			});
			if (md5Buffer(file.bytes) !== file.md5) throw new Error(`md5 mismatch while backing up ${rel}`);
		}
	}
	manifest.sort((a, b) => a.bucket.localeCompare(b.bucket) || a.path.localeCompare(b.path));
	await writeFile(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2));

	const tarPath = path.resolve(outDir, 'storage.tar.gz');
	await run('tar', ['-czf', tarPath, '-C', staging, '.']);

	const dumpHash = await sha256File(dumpPath);
	const tarHash = await sha256File(tarPath);
	const sums = `SHA256 (${path.basename(dumpPath)}) = ${dumpHash}\nSHA256 (${path.basename(tarPath)}) = ${tarHash}\n`;
	await writeFile(path.join(outDir, 'SHA256SUMS'), sums);
	await writeFile(
		path.join(outDir, 'backup.json'),
		JSON.stringify(
			{
				created_at: new Date().toISOString(),
				schema: 'public',
				dump: { file: 'public.dump', sha256: dumpHash },
				storage: { file: 'storage.tar.gz', sha256: tarHash, objects: manifest.length },
				buckets: BUCKETS
			},
			null,
			2
		)
	);
	console.log(`backup written to ${path.resolve(outDir)}`);
	console.log(sums.trim());
} finally {
	await source.end();
}
