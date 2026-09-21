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
	return resolve(event);
};
