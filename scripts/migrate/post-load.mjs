#!/usr/bin/env node
/**
 * After initial-load: apply roles.sql (a no-op when the user cannot create
 * roles) and print the target's table counts, order-independent md5s, and
 * sequence values. Does not read the source and does not reload data.
 *
 *   post-load
 * Environment: DATABASE_URL
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogSnapshot, libpqEnv, openReadOnly, parseArgs, run, targetUrlFrom } from './lib.mjs';

const rolesSql = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../deploy/postgrest/roles.sql');

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const targetUrl = targetUrlFrom(args);
	if (!targetUrl || args.help) {
		console.error('Usage: post-load   (DATABASE_URL)');
		process.exit(2);
	}
	console.log('applying deploy/postgrest/roles.sql (no data reload)');
	const roleArgs = [targetUrl, '-v', 'ON_ERROR_STOP=1', '-f', rolesSql];
	if (process.env.AUTHENTICATOR_PASSWORD) {
		roleArgs.splice(1, 0, '-v', `authenticator_password=${process.env.AUTHENTICATOR_PASSWORD}`);
	}
	await run('psql', roleArgs, libpqEnv(targetUrl));

	const target = await openReadOnly(targetUrl, 'target');
	try {
		const snap = await catalogSnapshot(target);
		console.log('target tables (count, order-independent md5):');
		for (const row of snap.tables) console.log(`  ${row.name}: count ${row.count} md5 ${row.md5}`);
		console.log('target sequences:');
		for (const row of snap.sequences) {
			console.log(`  ${row.name}: last_value ${row.last_value} is_called ${row.is_called}`);
		}
		console.log(`functions: count ${snap.functionSet.n} md5 ${snap.functionSet.md5}`);
		console.log(`triggers: count ${snap.triggerSet.n} md5 ${snap.triggerSet.md5}`);
		console.log(`views: count ${snap.views.length}`);
		for (const row of snap.views) console.log(`  ${row.name}: md5 ${row.md5}`);
		console.log(`enums: count ${snap.enums.length}`);
		for (const row of snap.enums) console.log(`  ${row.name}: ${row.labels}`);
		console.log('post-load: printed target state only. No data was reloaded.');
	} finally {
		await target.end();
	}
}

main().catch((error) => {
	console.error(error.message || error);
	process.exit(1);
});
