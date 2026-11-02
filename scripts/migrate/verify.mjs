#!/usr/bin/env node
/**
 * Compare the source Supabase database and Storage to the target database.
 * Exits 0 when everything matches, 1 when anything differs.
 *
 * Both database connections are read-only. Storage access is list and download.
 * public.files is compared to Storage objects (it does not exist on the source).
 *
 *   node scripts/migrate/verify.mjs
 *
 * Environment: SOURCE_DATABASE_URL, TARGET_DATABASE_URL,
 *              SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import {
	BUCKETS,
	createSourceStorage,
	databaseSnapshot,
	diffFiles,
	diffSnapshots,
	md5Buffer,
	openReadOnly,
	parseArgs,
	serviceRoleFrom,
	sourceUrlFrom,
	supabaseUrlFrom,
	targetFileRows,
	targetUrlFrom
} from './lib.mjs';

export async function sourceFileSnapshot(storage) {
	const files = [];
	for (const bucket of BUCKETS) {
		for (const object of await storage.listBucket(bucket)) {
			const downloaded = await storage.download(bucket, object.path);
			if (md5Buffer(downloaded.bytes) !== downloaded.md5) {
				throw new Error(`md5 mismatch downloading ${bucket}/${object.path}`);
			}
			files.push({ bucket, path: object.path, size: downloaded.size, md5: downloaded.md5 });
		}
	}
	files.sort((a, b) => a.bucket.localeCompare(b.bucket) || a.path.localeCompare(b.path));
	return files;
}

export async function verifyPair({ sourceUrl, targetUrl, supabaseUrl, serviceRoleKey }) {
	const source = await openReadOnly(sourceUrl, 'source');
	const target = await openReadOnly(targetUrl, 'target');
	try {
		const sourceSnap = await databaseSnapshot(source);
		const targetSnap = await databaseSnapshot(target);
		const mismatches = diffSnapshots(sourceSnap, targetSnap);
		const storage = createSourceStorage({ supabaseUrl, serviceRoleKey });
		const sourceFiles = await sourceFileSnapshot(storage);
		const targetFiles = await targetFileRows(target);
		mismatches.push(...diffFiles(sourceFiles, targetFiles));
		return {
			ok: mismatches.length === 0,
			mismatches,
			snapshot: { ...sourceSnap, files: sourceFiles }
		};
	} finally {
		await source.end();
		await target.end();
	}
}

function printReport(result) {
	const tables = result.snapshot.tables.length;
	const files = result.snapshot.files.length;
	console.log(
		`source: ${tables} tables, ${result.snapshot.sequences.length} sequences, ${result.snapshot.functions} functions, ${result.snapshot.triggers} triggers, ${files} files`
	);
	if (result.ok) {
		console.log('verify: OK, zero mismatches');
		return;
	}
	console.error(`verify: ${result.mismatches.length} mismatch(es)`);
	for (const line of result.mismatches) console.error(`  ${line}`);
}

const isMain = process.argv[1] && process.argv[1].endsWith('verify.mjs');
if (isMain) {
	const args = parseArgs(process.argv.slice(2));
	const sourceUrl = sourceUrlFrom(args);
	const targetUrl = targetUrlFrom(args);
	const supabaseUrl = supabaseUrlFrom(args);
	const serviceRoleKey = serviceRoleFrom(args);
	if (!sourceUrl || !targetUrl || args.help) {
		console.error('Usage: node scripts/migrate/verify.mjs');
		process.exit(2);
	}
	verifyPair({ sourceUrl, targetUrl, supabaseUrl, serviceRoleKey })
		.then((result) => {
			printReport(result);
			process.exit(result.ok ? 0 : 1);
		})
		.catch((error) => {
			console.error(error.message || error);
			process.exit(1);
		});
}
