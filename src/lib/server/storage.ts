import { randomUUID } from 'node:crypto';
import { config } from './env';
import { db } from './supabase';
import { ValidationError } from './validate';

/**
 * Submission evidence in Supabase Storage.
 *
 * The bucket is private. Paths are random UUIDs, so they cannot be guessed or
 * enumerated even if the bucket were ever misconfigured. Binaries never touch
 * Postgres — we store only the key.
 */

const allowed = config.storage.allowedMimeTypes as readonly string[];

export function validateUpload(file: File): void {
	if (!file || file.size === 0) {
		throw new ValidationError('Attach a screenshot of what you built', 'evidence');
	}
	if (file.size > config.storage.maxBytes) {
		const mb = Math.round(config.storage.maxBytes / (1024 * 1024));
		throw new ValidationError(`Evidence must be under ${mb}MB`, 'evidence');
	}
	// Trust the sniffed type from the platform File, not the filename extension.
	if (!allowed.includes(file.type)) {
		throw new ValidationError('Evidence must be a PNG, JPEG, WebP or GIF image', 'evidence');
	}
}

/** Upload and return the storage key. Caller records it against a submission. */
export async function uploadEvidence(userId: string, file: File): Promise<string> {
	validateUpload(file);

	// userId prefix scopes objects per participant; the UUID makes it unguessable
	const key = `${userId}/${randomUUID()}`;

	const { error } = await db()
		.storage.from(config.storage.bucket)
		.upload(key, await file.arrayBuffer(), {
			contentType: file.type,
			upsert: false
		});

	if (error) throw new Error(`Upload failed: ${error.message}`);
	return key;
}

/**
 * Short-lived signed URL so a reviewer can view private evidence. Generated
 * server-side per request; the bucket itself stays private.
 */
export async function signedEvidenceUrl(key: string, seconds = 300): Promise<string | null> {
	const { data, error } = await db()
		.storage.from(config.storage.bucket)
		.createSignedUrl(key, seconds);

	if (error || !data) return null;
	return data.signedUrl;
}
