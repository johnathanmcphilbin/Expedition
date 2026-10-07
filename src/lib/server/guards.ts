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

/**
 * Admin only. Reviewing checkpoints, granting hours outright and seeing
 * every user's balance are all gated here. The `reviewer` role only opens
 * the review queue (requireReviewer); it's granted by an operator in SQL.
 */
export function requireAdmin(locals: App.Locals): UserRow {
	const user = requireUser(locals);
	if (user.role !== 'admin') {
		// 404 rather than 403: don't confirm the route exists to a reviewer
		error(404, 'Not found');
	}
	return user;
}

/**
 * The review queue: admins, plus people given the `reviewer` role, who can
 * review submissions but see nothing else in the admin area.
 */
export function requireReviewer(locals: App.Locals): UserRow {
	const user = requireUser(locals);
	if (user.role !== 'admin' && user.role !== 'reviewer') error(404, 'Not found');
	return user;
}

/** A reviewer who isn't an admin: their decisions are signed with their name. */
export const isReviewerOnly = (user: UserRow) => user.role === 'reviewer';

/**
 * What a reviewer goes by, when it isn't their Hack Club name (that one is
 * overwritten from Hack Club Auth on every sign-in).
 */
const REVIEW_NAMES: Record<string, string> = {
	'b7226136-59a6-4680-8a4a-67434caa2953': 'Shadow' // anjalidadlani0@gmail.com
};

export const reviewerName = (user: UserRow) => REVIEW_NAMES[user.id] ?? user.display_name ?? 'a reviewer';

export function isAdmin(user: UserRow | null): boolean {
	return user?.role === 'admin';
}
