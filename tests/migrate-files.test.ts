import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { contentTypeOf, createSourceStorage, diffCatalog, diffStoredFiles } from '../scripts/migrate/lib.mjs';

function catalog(tables: { name: string; count: string; md5: string }[], tableNames: string[]) {
	return {
		tables,
		tableNames,
		sequences: [],
		functionSet: { n: 0, md5: 'x' },
		triggerSet: { n: 0, md5: 'x' },
		views: [],
		enums: []
	};
}

describe('verify catalog labels tables that exist only on the target', () => {
	it('names files as TARGET-ONLY and fails on any other extra table', () => {
		const source = catalog([{ name: 'users', count: '1', md5: 'a' }], ['users']);
		const target = catalog([{ name: 'users', count: '1', md5: 'a' }], ['users', 'files', 'orchard_extra']);
		const diff = diffCatalog(source, target);
		expect(diff.lines).toContain('table users: MATCH count 1 md5 a');
		expect(diff.lines).toContain('table files: TARGET-ONLY');
		expect(diff.lines).toContain('table orchard_extra: TARGET-ONLY (not on source; fails verify)');
		expect(diff.lines.some((line: string) => line.startsWith('table files:') && line.includes('MATCH'))).toBe(false);
		expect(diff.mismatches).toEqual(['table orchard_extra: TARGET-ONLY (not on source; fails verify)']);
	});
});

describe('verify file comparison', () => {
	const object = {
		bucket: 'checkpoint-images',
		path: 'user/a.png',
		size: 4,
		sha256: 'abcd',
		content_type: 'image/png'
	};

	it('prints MATCH per bucket and a total when size, sha256, and content_type agree', () => {
		const diff = diffStoredFiles(
			[object],
			[object],
			[
				{ bucket: 'checkpoint-images', listed: 2, duplicateListings: 1 },
				{ bucket: 'submission-screenshots', listed: 0, duplicateListings: 0 },
				{ bucket: 'submission-evidence', listed: 0, duplicateListings: 0 }
			]
		);
		expect(diff.mismatches).toEqual([]);
		expect(diff.lines).toContain('files checkpoint-images: MATCH count 1 target 1 (listed 2, duplicate listings 1)');
		expect(diff.lines).toContain('files submission-screenshots: MATCH count 0 target 0 (listed 0, duplicate listings 0)');
		expect(diff.lines).toContain('files submission-evidence: MATCH count 0 target 0 (listed 0, duplicate listings 0)');
		expect(diff.lines).toContain('files total: MATCH count 1 target 1');
	});

	it('fails on a missing file, an extra file, or a sha256 or content_type change', () => {
		const missing = diffStoredFiles([object], [], []);
		expect(missing.lines[0]).toMatch(/^files checkpoint-images: MISMATCH/);
		expect(missing.lines.at(-1)).toBe('files total: MISMATCH count 1 target 0');
		expect(missing.mismatches).toContain('file checkpoint-images/user/a.png: missing on target');

		const extra = diffStoredFiles([], [object], []);
		expect(extra.mismatches).toContain('file checkpoint-images/user/a.png: extra on target');
		expect(extra.lines.at(-1)).toBe('files total: MISMATCH count 0 target 1');

		const changed = diffStoredFiles([object], [{ ...object, sha256: 'ffff', content_type: 'text/plain' }], []);
		expect(changed.mismatches).toContain('file checkpoint-images/user/a.png: sha256 abcd != ffff');
		expect(changed.mismatches).toContain('file checkpoint-images/user/a.png: content_type image/png != text/plain');
		expect(changed.lines.at(-1)).toBe('files total: MISMATCH count 1 target 1');
	});
});

describe('storage hashing streams', () => {
	it('hashes one chunk at a time and counts a repeated path once', async () => {
		const payload = Buffer.concat([Buffer.alloc(1000, 0x61), Buffer.alloc(1000, 0x62)]);
		const expected = createHash('sha256').update(payload).digest('hex');
		const server = createServer((req, res) => {
			const url = new URL(req.url ?? '/', 'http://127.0.0.1');
			if (req.method === 'POST' && url.pathname === '/storage/v1/object/list/checkpoint-images') {
				const file = { name: 'a.bin', id: '1', metadata: { mimetype: 'application/octet-stream; charset=binary' } };
				res.writeHead(200, { 'content-type': 'application/json' });
				res.end(JSON.stringify([file, file]));
				return;
			}
			if (req.method === 'GET' && url.pathname === '/storage/v1/object/checkpoint-images/a.bin') {
				res.writeHead(200, { 'content-type': 'application/octet-stream' });
				res.write(payload.subarray(0, 1000));
				res.end(payload.subarray(1000));
				return;
			}
			res.writeHead(404);
			res.end('missing');
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		const address = server.address();
		if (!address || typeof address === 'string') throw new Error('no port');
		try {
			const storage = createSourceStorage({
				supabaseUrl: `http://127.0.0.1:${address.port}`,
				serviceRoleKey: 'test-key'
			});
			const listed = await storage.listBucket('checkpoint-images');
			expect(listed).toHaveLength(1);
			expect(listed.listed).toBe(2);
			expect(listed.duplicateListings).toBe(1);
			const hashed = await storage.hashObject('checkpoint-images', 'a.bin');
			expect(hashed.sha256).toBe(expected);
			expect(hashed.size).toBe(payload.length);
			expect(hashed.bytes).toBeUndefined();
			expect(contentTypeOf(listed[0].metadata?.mimetype, hashed.contentType)).toBe('application/octet-stream');
			const downloaded = await storage.download('checkpoint-images', 'a.bin');
			expect(downloaded.bytes.equals(payload)).toBe(true);
			expect(downloaded.sha256).toBe(expected);
		} finally {
			await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
		}
	});
});
