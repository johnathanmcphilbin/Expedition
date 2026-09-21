import { error, redirect } from '@sveltejs/kit';
import type { UserRow } from './database.types';

/**
 * Authorization helpers.
 *
 * Roles are always read from `locals.user`, which hooks.server.ts populates
 * from the session row in the database. No role ever arrives from the client.
 */

export function requireUser(locals: App.Locals, returnTo?: string): UserRow {
	if (!locals.user) {
		const target = returnTo ? `?next=${encodeURIComponent(returnTo)}` : '';
		redirect(303, `/auth/login${target}`);
	}
	return locals.user;
}

export function requireReviewer(locals: App.Locals): UserRow {
	const user = requireUser(locals);
	if (user.role !== 'reviewer' && user.role !== 'admin') {
		// 404 rather than 403: don't confirm the route exists to a participant
		error(404, 'Not found');
	}
	return user;
}

export function isReviewer(user: UserRow | null): boolean {
	return user?.role === 'reviewer' || user?.role === 'admin';
}
