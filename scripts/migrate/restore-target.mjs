#!/usr/bin/env node
/**
 * Restore a public-schema dump onto the TARGET database.
 *
 * Refuses to run when the target already has objects in schema public,
 * unless --fresh-target is given. --fresh-target drops schema public on the
 * TARGET and recreates it. This script refuses any URL that looks like the
 * source Supabase project.
 *
 *   node scripts/migrate/restore-target.mjs --dump backups/.../public.dump
 *   node scripts/migrate/restore-target.mjs --dump backups/.../public.dump --fresh-target
 *
 * Environment: TARGET_DATABASE_URL
 */
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import {
	assertCanWriteSchema,
	assertRestoreTarget,
	libpqEnv,
	parseArgs,
	publicShape,
	run,
	shapeIsEmpty,
	targetUrlFrom
} from './lib.mjs';

export async function restoreDump({ targetUrl, dumpPath, fresh }) {
	assertRestoreTarget(targetUrl);
	const admin = new pg.Client({
		connectionString: targetUrl,
		application_name: 'expedition-migrate-restore'
	});
	await admin.connect();
	try {
		await assertCanWriteSchema(admin, 'target');
		const before = await publicShape(admin);
		if (!shapeIsEmpty(before) && !fresh) {
			throw new Error(
				`target schema public is not empty (${before.tables} tables, ${before.views} views, ${before.sequences} sequences, ${before.functions} functions). Re-run with --fresh-target to drop it on the TARGET only.`
			);
		}
		if (fresh) {
			console.log('dropping target schema public (--fresh-target)');
			await admin.query('drop schema if exists public cascade');
			await admin.query('create schema public');
		}
		await admin.query('create extension if not exists pgcrypto');
	} finally {
		await admin.end();
	}

	console.log(`pg_restore ${dumpPath}`);
	const env = libpqEnv(targetUrl);
	// pg_restore does not default to PGDATABASE the way psql does. The dump
	// also contains CREATE SCHEMA public, which already exists on a new database.
	const listed = await run('pg_restore', ['--list', dumpPath], env);
	const toc = listed.stdout
		.split('\n')
		.filter((line) => !/^\d+; \d+ \d+ SCHEMA - public /.test(line))
		.join('\n');
	const tocPath = path.join(tmpdir(), `expedition-restore-${process.pid}.list`);
	await writeFile(tocPath, toc);
	await run(
		'pg_restore',
		[
			'--use-list',
			tocPath,
			'--no-owner',
			'--no-privileges',
			'--exit-on-error',
			'--single-transaction',
			'--dbname',
			env.PGDATABASE,
			dumpPath
		],
		env
	);
}

const isMain = process.argv[1] && process.argv[1].endsWith('restore-target.mjs');
if (isMain) {
	const args = parseArgs(process.argv.slice(2));
	const targetUrl = targetUrlFrom(args);
	const dumpPath = args.dump;
	if (!targetUrl || !dumpPath || args.help) {
		console.error('Usage: node scripts/migrate/restore-target.mjs --dump <public.dump> [--fresh-target]');
		process.exit(2);
	}
	restoreDump({ targetUrl, dumpPath, fresh: args['fresh-target'] === true })
		.then(() => console.log('restore finished'))
		.catch((error) => {
			console.error(error.message || error);
			process.exit(1);
		});
}
