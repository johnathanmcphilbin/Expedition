#!/usr/bin/env node
/**
 * Compare the source Supabase database and Storage to the target database.
 * Exits 0 when everything matches, 1 when anything differs.
 *
 * Both database connections are read-only. Storage access is list and download.
 * public.files is compared to Storage objects (it does not exist on the source).
 * Each object is streamed into sha256. The bytes are not kept.
 *
 *   node scripts/migrate/verify.mjs
 *
 * Environment: SOURCE_DATABASE_URL, TARGET_DATABASE_URL,
 *              SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import {
	BUCKETS,
	catalogSnapshot,
	contentTypeOf,
	createSourceStorage,
	diffCatalog,
	diffStoredFiles,
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
	const listings = [];
	for (const bucket of BUCKETS) {
		const objects = await storage.listBucket(bucket);
		listings.push({
			bucket,
			listed: objects.listed,
			duplicateListings: objects.duplicateListings
		});
		for (const object of objects) {
			const hashed = await storage.hashObject(bucket, object.path);
			files.push({
				bucket,
				path: object.path,
				size: hashed.size,
				sha256: hashed.sha256,
				content_type: contentTypeOf(object.metadata?.mimetype, hashed.contentType)
			});
		}
	}
	files.sort((a, b) => a.bucket.localeCompare(b.bucket) || a.path.localeCompare(b.path));
	return { files, listings };
}

export async function verifyPair({ sourceUrl, targetUrl, supabaseUrl, serviceRoleKey }) {
	const source = await openReadOnly(sourceUrl, 'source');
	const target = await openReadOnly(targetUrl, 'target');
	try {
		const sourceSnap = await catalogSnapshot(source);
		const targetSnap = await catalogSnapshot(target);
		const compared = diffCatalog(sourceSnap, targetSnap);
		const mismatches = [...compared.mismatches];
		let fileLines = [];
		let fileDetails = [];
		const filesCompared = Boolean(supabaseUrl && serviceRoleKey);
		if (filesCompared) {
			const storage = createSourceStorage({ supabaseUrl, serviceRoleKey });
			const snapshot = await sourceFileSnapshot(storage);
			const targetFiles = await targetFileRows(target);
			const fileDiff = diffStoredFiles(snapshot.files, targetFiles, snapshot.listings);
			fileLines = fileDiff.lines;
			fileDetails = fileDiff.mismatches;
			mismatches.push(...fileDiff.mismatches);
		}
		return {
			ok: mismatches.length === 0,
			mismatches,
			lines: compared.lines,
			filesCompared,
			fileLines,
			fileDetails
		};
	} finally {
		await source.end();
		await target.end();
	}
}

function printReport(result) {
	for (const line of result.lines) console.log(line);
	if (!result.filesCompared) {
		console.log('files: SKIP no storage credentials (database objects were compared; nothing was reloaded)');
	} else {
		for (const line of result.fileLines) console.log(line);
		for (const line of result.fileDetails) console.log(`  ${line}`);
	}
	if (result.ok) {
		console.log('verify: OVERALL MATCH');
		return;
	}
	console.error(`verify: OVERALL MISMATCH (${result.mismatches.length})`);
	const printed = new Set([...(result.lines ?? []), ...(result.fileLines ?? []), ...(result.fileDetails ?? [])]);
	for (const line of result.mismatches) {
		if (!printed.has(line)) console.error(`  ${line}`);
	}
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
