/**
 * Who may read a stored file. This matches who the app used to hand a signed
 * URL to:
 *
 * - checkpoint images on the public log (visibility `shown`) are public
 * - a participant sees their own checkpoint images
 * - reviewers and admins see every checkpoint image (the review page includes
 *   private ones) and every submission screenshot
 * - library screenshots (sent, and the builder opted in) are public
 * - the legacy submission-evidence bucket has no public page; staff only
 */

export type FileViewer = { id: string; role: string } | null;

export type CheckpointRef = { user_id: string; visibility: string } | null;

export type SubmissionRef = { user_id: string; status: string; library_opt_in: boolean } | null;

export const KNOWN_BUCKETS = new Set([
	'checkpoint-images',
	'submission-screenshots',
	'submission-evidence'
]);

export function isSafeObjectPath(path: string | undefined | null): path is string {
	if (!path || path.length > 1024) return false;
	if (path.startsWith('/') || path.includes('\\') || path.includes('\0')) return false;
	const parts = path.split('/');
	return parts.every((part) => part.length > 0 && part !== '.' && part !== '..');
}

export function fileUrl(bucket: string, path: string | null): string | null {
	if (!KNOWN_BUCKETS.has(bucket) || !isSafeObjectPath(path)) return null;
	const encoded = path.split('/').map(encodeURIComponent).join('/');
	return `/files/${encodeURIComponent(bucket)}/${encoded}`;
}

export function decideFileAccess(args: {
	bucket: string;
	viewer: FileViewer;
	checkpoint: CheckpointRef;
	submission: SubmissionRef;
	fileExists: boolean;
}): { ok: true; publicity: 'public' | 'private' } | { ok: false } {
	if (!args.fileExists || !KNOWN_BUCKETS.has(args.bucket)) return { ok: false };
	const staff = args.viewer?.role === 'admin' || args.viewer?.role === 'reviewer';

	if (args.bucket === 'checkpoint-images') {
		if (!args.checkpoint) return { ok: false };
		if (args.checkpoint.visibility === 'shown') return { ok: true, publicity: 'public' };
		if (args.viewer && args.viewer.id === args.checkpoint.user_id) return { ok: true, publicity: 'private' };
		if (staff) return { ok: true, publicity: 'private' };
		return { ok: false };
	}

	if (args.bucket === 'submission-screenshots') {
		if (!args.submission) return { ok: false };
		if (args.submission.status === 'sent' && args.submission.library_opt_in) {
			return { ok: true, publicity: 'public' };
		}
		if (staff) return { ok: true, publicity: 'private' };
		return { ok: false };
	}

	if (args.bucket === 'submission-evidence') {
		if (staff) return { ok: true, publicity: 'private' };
		return { ok: false };
	}

	return { ok: false };
}
