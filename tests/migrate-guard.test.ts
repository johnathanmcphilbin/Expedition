import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { assertStorageRead } from '../scripts/migrate/lib.mjs';
import { runOrchardTests } from '../scripts/migrate/run-orchard-tests.mjs';

describe('orchard test command', () => {
	it('refuses a Supabase URL before opening a connection', async () => {
		await expect(
			runOrchardTests({
				POSTGREST_URL: 'https://ulmowedmbobncmcriszs.supabase.co',
				DATABASE_URL: 'postgres://user:password@127.0.0.1:5432/expedition'
			})
		).rejects.toThrow(/Supabase/);
	});
});

describe('source storage allow-list', () => {
	it('allows list and download only', () => {
		expect(() => assertStorageRead('POST', '/storage/v1/object/list/checkpoint-images')).not.toThrow();
		expect(() => assertStorageRead('GET', '/storage/v1/object/checkpoint-images/a/b.png')).not.toThrow();
		expect(() => assertStorageRead('DELETE', '/storage/v1/object/checkpoint-images/a/b.png')).toThrow(/blocked/);
		expect(() => assertStorageRead('PUT', '/storage/v1/object/checkpoint-images/a/b.png')).toThrow(/blocked/);
		expect(() => assertStorageRead('POST', '/storage/v1/object/checkpoint-images/a/b.png')).toThrow(/blocked/);
		expect(() => assertStorageRead('GET', '/storage/v1/object/list/checkpoint-images')).toThrow(/blocked/);
	});
});

describe('decommission is not referenced by the other migrate scripts', () => {
	it('no sibling script imports or spawns it', () => {
		const dir = path.resolve('scripts/migrate');
		for (const name of readdirSync(dir)) {
			// self-test.mjs only invokes it to prove it exits before deleting.
			if (name.startsWith('decommission-supabase') || name === 'self-test.mjs') continue;
			const text = readFileSync(path.join(dir, name), 'utf8');
			expect(text, name).not.toMatch(/decommission-supabase/);
		}
	});
});
