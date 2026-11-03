#!/usr/bin/env node
/**
 * MIGRATE_COMMAND=test
 *
 * Runs the Orchard flow suite against POSTGREST_URL and then stays out of
 * Supabase. Rows are created by tests/orchard-flows.integration.test.ts and
 * tagged orchard-test-. Cleanup deletes those rows only. hour_transactions
 * is append-only, so a paid test user is left in place, still tagged.
 *
 * The JWT secret is POSTGREST_JWT_SECRET if set, otherwise the same derived
 * secret the PostgREST image uses. It is never printed.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { startVitest } from 'vitest/node';
import { resolveJwtSecret } from '../lib/postgrest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BANNED = /supabase\.(co|com)|ulmowedmbobncmcriszs/i;

function refuse(value, label) {
	if (value && BANNED.test(value)) {
		throw new Error(`Refusing tests: ${label} looks like Supabase. Nothing was contacted.`);
	}
}

async function checkNoJwt(postgrestUrl) {
	const target = `${postgrestUrl.replace(/\/+$/, '')}/users?select=id&limit=1`;
	let response;
	try {
		response = await fetch(target, { headers: { accept: 'application/json' }, redirect: 'manual' });
	} catch (error) {
		return { ok: false, name: 'no JWT returns 401', detail: error.message };
	}
	const text = await response.text();
	const ok = response.status === 401 && !text.trim().startsWith('[');
	return {
		ok,
		name: 'no JWT returns 401',
		detail: ok ? '' : `status ${response.status} body ${text.slice(0, 180)}`
	};
}

async function loginRole(databaseUrl) {
	const client = new pg.Client({
		connectionString: databaseUrl,
		application_name: 'expedition-migrate-test'
	});
	try {
		await client.connect();
		const { rows } = await client.query('select current_user as role');
		return rows[0].role;
	} catch {
		throw new Error('could not read current_user from DATABASE_URL');
	} finally {
		await client.end().catch(() => {});
	}
}

async function runVitest(env) {
	const dir = await mkdtemp(path.join(tmpdir(), 'expedition-orchard-'));
	const output = path.join(dir, 'report.json');
	const previous = {
		cwd: process.cwd(),
		env: { ...process.env }
	};
	process.chdir(ROOT);
	Object.assign(process.env, env);
	let vitest;
	try {
		vitest = await startVitest(
			'test',
			['tests/orchard-flows.integration.test.ts'],
			{
				watch: false,
				reporters: ['json'],
				outputFile: output,
				fileParallelism: false,
				maxWorkers: 1,
				silent: true
			}
		);
	} catch (error) {
		await rm(dir, { recursive: true, force: true });
		return [{ ok: false, name: 'orchard flow suite', detail: error.message || String(error) }];
	} finally {
		process.chdir(previous.cwd);
		for (const key of Object.keys(process.env)) {
			if (!(key in previous.env)) delete process.env[key];
		}
		Object.assign(process.env, previous.env);
	}
	await vitest?.close();
	let report;
	try {
		report = JSON.parse(await readFile(output, 'utf8'));
	} catch (error) {
		await rm(dir, { recursive: true, force: true });
		return [{ ok: false, name: 'orchard flow suite', detail: error.message || 'vitest wrote no report' }];
	}
	await rm(dir, { recursive: true, force: true });
	const rows = [];
	for (const file of report.testResults ?? []) {
		const assertions = file.assertionResults ?? [];
		if (!assertions.length && file.status === 'failed') {
			rows.push({ ok: false, name: file.name || 'orchard flow suite', detail: (file.message || 'suite failed').slice(0, 1500) });
		}
		for (const test of assertions) {
			const ok = test.status === 'passed';
			rows.push({
				ok,
				name: test.fullName,
				detail: ok ? '' : (test.failureMessages || []).join('\n').slice(0, 1500)
			});
		}
	}
	if (!rows.length) {
		rows.push({ ok: false, name: 'orchard flow suite', detail: 'no tests ran' });
	}
	return rows;
}

export async function runOrchardTests(env = process.env) {
	refuse(env.POSTGREST_URL, 'POSTGREST_URL');
	refuse(env.DATABASE_URL, 'DATABASE_URL');
	refuse(env.PGRST_DB_URI, 'PGRST_DB_URI');
	if (!env.POSTGREST_URL) throw new Error('POSTGREST_URL is required');
	const databaseUrl = env.DATABASE_URL || env.PGRST_DB_URI;
	if (!databaseUrl) throw new Error('DATABASE_URL is required');

	const secret = resolveJwtSecret(env);
	let role = env.POSTGREST_DB_ROLE?.trim();
	if (!role) {
		role = await loginRole(databaseUrl);
		console.log(`POSTGREST_DB_ROLE unset; JWT role claim is the database login ${role}`);
	}

	const childEnv = { ...env };
	delete childEnv.SOURCE_DATABASE_URL;
	delete childEnv.SUPABASE_URL;
	delete childEnv.SUPABASE_SERVICE_ROLE_KEY;
	delete childEnv.SUPABASE_ANON_KEY;
	childEnv.RUN_ORCHARD_TESTS = '1';
	childEnv.POSTGREST_JWT_SECRET = secret;
	childEnv.PGRST_JWT_SECRET = secret;
	childEnv.POSTGREST_DB_ROLE = role;

	const results = [await checkNoJwt(env.POSTGREST_URL)];
	results.push(...(await runVitest(childEnv)));

	let passed = 0;
	let failed = 0;
	for (const row of results) {
		if (row.ok) passed++;
		else failed++;
		console.log(`${row.ok ? 'PASS' : 'FAIL'} ${row.name}`);
		if (!row.ok && row.detail) {
			for (const line of row.detail.split('\n').slice(0, 12)) console.log(`  ${line}`);
		}
	}
	console.log(`tests: ${passed} passed, ${failed} failed`);
	return failed === 0 ? 0 : 1;
}

const isMain = process.argv[1] && process.argv[1].endsWith('run-orchard-tests.mjs');
if (isMain) {
	runOrchardTests()
		.then((code) => process.exit(code))
		.catch((error) => {
			console.error(error.message || error);
			console.log('tests: 0 passed, 1 failed');
			process.exit(1);
		});
}
