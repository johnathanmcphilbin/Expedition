import { db, postgrestFetch } from './db';
import { decideFileAccess, fileUrl, isSafeObjectPath, KNOWN_BUCKETS, type FileViewer } from './files-access';

export { decideFileAccess, fileUrl, isSafeObjectPath, KNOWN_BUCKETS };

function hexOf(bytes: Uint8Array): string {
	let hex = '';
	for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
	return `\\x${hex}`;
}

/** Insert one object. Paths are unique per bucket; a collision is an error. */
export async function uploadObject(
	bucket: string,
	path: string,
	body: ArrayBuffer | Uint8Array,
	contentType: string
): Promise<{ error: { message: string } | null }> {
	const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
	const { error } = await db()
		.from('files')
		.insert({
			bucket,
			path,
			content_type: contentType || 'application/octet-stream',
			size: bytes.byteLength,
			bytes: hexOf(bytes)
		});
	return { error: error ? { message: error.message } : null };
}

export async function removeObjects(bucket: string, paths: string[]): Promise<void> {
	const clean = paths.filter((path) => !!path);
	if (!clean.length) return;
	const { error } = await db().from('files').delete().eq('bucket', bucket).in('path', clean);
	if (error) console.error('removeObjects', error.message);
}

export async function downloadObject(
	bucket: string,
	path: string
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
	return openObject(bucket, path);
}

/**
 * Read one object's bytes through PostgREST. The response is JSON with the
 * bytea column in hex (`\x...`); PostgREST 16 does not offer a raw
 * octet-stream for bytea. Screenshots are capped at a few megabytes, so the
 * route decodes the hex and writes the raw bytes on the HTTP response.
 */
export async function openObject(
	bucket: string,
	path: string
): Promise<{ bytes: Uint8Array; contentType: string; size: number } | null> {
	const meta = await db()
		.from('files')
		.select('content_type, size')
		.eq('bucket', bucket)
		.eq('path', path)
		.maybeSingle();
	if (meta.error || !meta.data) return null;

	const query = new URLSearchParams({
		bucket: `eq.${bucket}`,
		path: `eq.${path}`,
		select: 'bytes'
	});
	const res = await postgrestFetch(`/files?${query}`, { headers: { Accept: 'application/json' } });
	if (!res.ok) {
		console.error('openObject', res.status, await res.text().catch(() => ''));
		return null;
	}
	const rows = (await res.json()) as { bytes?: string }[];
	const hex = rows[0]?.bytes ?? '';
	const digits = hex.startsWith('\\x') ? hex.slice(2) : hex;
	if (!digits || digits.length % 2 !== 0) return null;
	return {
		bytes: Buffer.from(digits, 'hex'),
		contentType: meta.data.content_type || 'application/octet-stream',
		size: Number(meta.data.size)
	};
}

export async function fileAccessContext(bucket: string, path: string, viewer: FileViewer) {
	const exists = await db()
		.from('files')
		.select('bucket')
		.eq('bucket', bucket)
		.eq('path', path)
		.maybeSingle();
	if (exists.error) {
		console.error('fileAccessContext', exists.error.message);
		return decideFileAccess({ bucket, viewer, checkpoint: null, submission: null, fileExists: false });
	}

	let checkpoint: { user_id: string; visibility: string } | null = null;
	let submission: { user_id: string; status: string; library_opt_in: boolean } | null = null;

	if (bucket === 'checkpoint-images') {
		const row = await db()
			.from('checkpoints')
			.select('user_id, visibility')
			.eq('image_path', path)
			.limit(1)
			.maybeSingle();
		checkpoint = row.data ?? null;
	} else if (bucket === 'submission-screenshots') {
		const row = await db()
			.from('submission_queue')
			.select('user_id, status, library_opt_in')
			.eq('screenshot_path', path)
			.limit(1)
			.maybeSingle();
		submission = row.data ?? null;
	}

	return decideFileAccess({
		bucket,
		viewer,
		checkpoint,
		submission,
		fileExists: !!exists.data
	});
}
