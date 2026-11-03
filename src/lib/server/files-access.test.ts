import { describe, expect, it } from 'vitest';
import { decideFileAccess, fileUrl, isSafeObjectPath } from './files-access';

const owner = { id: 'user-1', role: 'participant' };
const other = { id: 'user-2', role: 'participant' };
const reviewer = { id: 'rev', role: 'reviewer' };
const admin = { id: 'adm', role: 'admin' };

describe('file paths', () => {
	it('rejects traversal and accepts storage-shaped paths', () => {
		expect(isSafeObjectPath('user/pic.png')).toBe(true);
		expect(isSafeObjectPath('../etc/passwd')).toBe(false);
		expect(isSafeObjectPath('a/../../b')).toBe(false);
		expect(isSafeObjectPath('/etc/passwd')).toBe(false);
		expect(isSafeObjectPath('a//b')).toBe(false);
		expect(fileUrl('checkpoint-images', 'user/pic.png')).toBe('/files/checkpoint-images/user/pic.png');
		expect(fileUrl('checkpoint-images', '../x')).toBeNull();
		expect(fileUrl('other', 'a/b')).toBeNull();
	});
});

describe('file access', () => {
	const base = { fileExists: true as const };

	it('publishes shown checkpoints and keeps the rest to the owner and staff', () => {
		const shown = { user_id: 'user-1', visibility: 'shown' };
		expect(decideFileAccess({ ...base, bucket: 'checkpoint-images', viewer: null, checkpoint: shown, submission: null })).toEqual({
			ok: true,
			publicity: 'public'
		});
		const priv = { user_id: 'user-1', visibility: 'private' };
		expect(decideFileAccess({ ...base, bucket: 'checkpoint-images', viewer: null, checkpoint: priv, submission: null }).ok).toBe(false);
		expect(decideFileAccess({ ...base, bucket: 'checkpoint-images', viewer: owner, checkpoint: priv, submission: null })).toEqual({
			ok: true,
			publicity: 'private'
		});
		expect(decideFileAccess({ ...base, bucket: 'checkpoint-images', viewer: other, checkpoint: priv, submission: null }).ok).toBe(false);
		expect(decideFileAccess({ ...base, bucket: 'checkpoint-images', viewer: reviewer, checkpoint: priv, submission: null }).ok).toBe(true);
		expect(decideFileAccess({ ...base, bucket: 'checkpoint-images', viewer: admin, checkpoint: priv, submission: null }).ok).toBe(true);
	});

	it('publishes library screenshots and keeps the queue to staff', () => {
		const library = { user_id: 'user-1', status: 'sent', library_opt_in: true };
		expect(decideFileAccess({ ...base, bucket: 'submission-screenshots', viewer: null, checkpoint: null, submission: library })).toEqual({
			ok: true,
			publicity: 'public'
		});
		const pending = { user_id: 'user-1', status: 'pending', library_opt_in: true };
		expect(decideFileAccess({ ...base, bucket: 'submission-screenshots', viewer: owner, checkpoint: null, submission: pending }).ok).toBe(false);
		expect(decideFileAccess({ ...base, bucket: 'submission-screenshots', viewer: reviewer, checkpoint: null, submission: pending }).ok).toBe(true);
	});

	it('keeps legacy evidence to staff and hides missing files', () => {
		expect(decideFileAccess({ ...base, bucket: 'submission-evidence', viewer: null, checkpoint: null, submission: null }).ok).toBe(false);
		expect(decideFileAccess({ ...base, bucket: 'submission-evidence', viewer: admin, checkpoint: null, submission: null })).toEqual({
			ok: true,
			publicity: 'private'
		});
		expect(
			decideFileAccess({
				fileExists: false,
				bucket: 'checkpoint-images',
				viewer: admin,
				checkpoint: { user_id: 'user-1', visibility: 'shown' },
				submission: null
			}).ok
		).toBe(false);
	});
});
