import type { LayoutServerLoad } from './$types';

/**
 * Exposes a minimal, non-sensitive view of the current user to every page.
 * Deliberately omits tokens, ids and anything else the browser has no need for.
 */
export const load: LayoutServerLoad = async ({ locals }) => ({
	currentUser: locals.user
		? {
				displayName: locals.user.display_name,
				isReviewer: locals.user.role === 'reviewer' || locals.user.role === 'admin'
			}
		: null
});
