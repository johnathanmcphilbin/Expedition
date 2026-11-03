import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { deriveJwtSecret as deriveTs, resolveJwtSecret as resolveTs } from '$lib/server/postgrest-jwt';
import { deriveJwtSecret as deriveMjs, resolveJwtSecret as resolveMjs } from '../scripts/lib/postgrest.mjs';

const urls = [
	'postgres://user:simple@127.0.0.1:5432/db',
	'postgresql://user:p%40ss%2Fword@h/db',
	'postgres://user:a%2Bb%20c@h/db?sslmode=require',
	'postgres://user:caf%C3%A9@h/db',
	'postgres://user:p%25cent@h/db',
	'postgres://u_ysws:s3cret-pass@pg-expedition-pooler-rw.ysws-expedition.svc.cluster.local:5432/expedition'
];

describe('derived PostgREST JWT secret', () => {
	it('matches between the app, the migrate scripts, and the PostgREST shell helper', () => {
		for (const url of urls) {
			const fromTs = deriveTs(url);
			const fromMjs = deriveMjs(url);
			expect(fromTs).toBe(fromMjs);
			expect(fromTs).toMatch(/^[0-9a-f]{64}$/);
			const shell = spawnSync('sh', ['deploy/postgrest/derive-jwt-secret.sh'], {
				env: { DATABASE_URL: url, PATH: process.env.PATH },
				encoding: 'utf8'
			});
			expect(shell.status).toBe(0);
			expect(shell.stdout).toBe(fromTs);
			expect(shell.stderr ?? '').not.toContain('s3cret');
			expect(shell.stdout).not.toContain('postgres');
		}
	});

	it('lets an explicit secret win and refuses two different explicit secrets', () => {
		const url = urls[0];
		expect(resolveTs({ POSTGREST_JWT_SECRET: 'x'.repeat(32), DATABASE_URL: url })).toBe('x'.repeat(32));
		expect(resolveMjs({ PGRST_JWT_SECRET: 'y'.repeat(32), DATABASE_URL: url })).toBe('y'.repeat(32));
		expect(resolveTs({ DATABASE_URL: url })).toBe(deriveTs(url));
		expect(() =>
			resolveMjs({ POSTGREST_JWT_SECRET: 'a'.repeat(32), PGRST_JWT_SECRET: 'b'.repeat(32) })
		).toThrow(/differ/);
	});

	it('does not include the password in a percent-encoding error', () => {
		expect(() => deriveMjs('postgres://user:bad%zz@h/db')).toThrow(/percent-encoding/);
		try {
			deriveMjs('postgres://user:bad%zz@h/db');
		} catch (error) {
			expect(String(error)).not.toContain('bad%zz');
		}
	});
});
