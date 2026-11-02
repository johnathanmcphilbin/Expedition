import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sanitizeDump, splitSql, streamSanitizeFile } from '../scripts/migrate/sanitize-dump.mjs';

const SAMPLE = `
SET statement_timeout = 0;
SELECT pg_catalog.set_config('search_path', '', false);
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA public;
CREATE TABLE public.profiles (
    id uuid DEFAULT auth.uid() NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    note text DEFAULT extensions.gen_random_uuid()
);
CREATE OR REPLACE FUNCTION public.touch_storage() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  PERFORM storage.foldername(NEW.name);
  RETURN NEW;
END;
$fn$;
CREATE VIEW public.who AS SELECT id FROM auth.users;
INSERT INTO public.profiles (note) VALUES ('mentions auth.users in text');
\\restrict junk
`;

describe('sanitizeDump', () => {
	it('splits dollar-quoted function bodies on the real semicolons', () => {
		const parts = splitSql(SAMPLE);
		expect(parts.some((part) => part.includes('PERFORM storage.foldername'))).toBe(true);
		expect(parts.some((part) => part.startsWith('INSERT INTO'))).toBe(true);
	});

	it('drops Supabase-only extensions and objects, and keeps public data', () => {
		const { sql, changes } = sanitizeDump(SAMPLE);
		expect(sql).not.toMatch(/supabase_vault/);
		expect(sql).not.toMatch(/pg_stat_statements/);
		expect(sql).not.toMatch(/REFERENCES\s+auth/i);
		expect(sql).not.toMatch(/DEFAULT\s+auth/i);
		expect(sql).not.toMatch(/storage\.foldername/);
		expect(sql).toMatch(/CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public/);
		expect(sql).toMatch(/gen_random_uuid\(\)/);
		expect(sql).toMatch(/mentions auth\.users in text/);
		expect(sql).not.toMatch(/touch_storage/);
		expect(sql).not.toMatch(/CREATE VIEW public.who/);
		expect(changes.filter((change) => change.action === 'drop').map((change) => change.name)).toEqual(
			expect.arrayContaining(['supabase_vault', 'pg_stat_statements', 'touch_storage', 'who', 'public'])
		);
		expect(changes.some((change) => change.action === 'rewrite' && /foreign key/i.test(change.reason))).toBe(true);
	});

	it('streams a file into the same statements', async () => {
		const dir = await mkdtemp(path.join(tmpdir(), 'sanitize-'));
		const file = path.join(dir, 'dump.sql');
		await writeFile(file, SAMPLE);
		const kept: string[] = [];
		await streamSanitizeFile(file, async (statement: string) => {
			kept.push(statement);
		});
		expect(kept).toEqual(sanitizeDump(SAMPLE).statements);
	});
});
