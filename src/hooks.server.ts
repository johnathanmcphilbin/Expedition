import type { Handle } from '@sveltejs/kit';
import { readSession } from '$lib/server/session';

/**
 * Resolves the current user once per request from the session cookie and puts
 * it on `locals`. This is the single source of identity for every server load
 * function and form action — nothing downstream reads a user id or role from
 * the request body or query string.
 */
export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = await readSession(event.cookies);
	const response = await resolve(event);

	// No framing (clickjacking on admin buttons), no MIME sniffing, no full
	// URLs leaking to other sites, HTTPS only once it's been seen.
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	if (event.url.protocol === 'https:') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}
	// signed-in pages carry personal data; never let a shared cache keep them
	if (event.locals.user && !response.headers.has('cache-control')) {
		response.headers.set('Cache-Control', 'private, no-store');
	}
	return response;
};
