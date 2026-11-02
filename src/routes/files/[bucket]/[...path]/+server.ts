import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fileAccessContext, isSafeObjectPath, KNOWN_BUCKETS, openObject } from '$lib/server/files';

/**
 * Streams a file that used to live in Storage. Access is checked on every
 * request (the old signed URL was only minted for someone who already passed
 * the same rules).
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	const bucket = params.bucket ?? '';
	const path = params.path ?? '';
	if (!KNOWN_BUCKETS.has(bucket) || !isSafeObjectPath(path)) error(404, 'Not found');

	const decision = await fileAccessContext(bucket, path, locals.user);
	if (!decision.ok) error(404, 'Not found');

	const file = await openObject(bucket, path);
	if (!file) error(404, 'Not found');

	const body = new ArrayBuffer(file.bytes.byteLength);
	new Uint8Array(body).set(file.bytes);
	return new Response(body, {
		headers: {
			'content-type': file.contentType,
			'content-length': String(file.size),
			'content-disposition': 'inline',
			'cache-control': decision.publicity === 'public' ? 'public, max-age=3600' : 'private, no-store',
			'x-content-type-options': 'nosniff'
		}
	});
};
