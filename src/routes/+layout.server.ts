import { connectionStatus } from '$lib/server/hackatime';
import type { LayoutServerLoad } from './$types';

/**
 * Exposes a minimal, non-sensitive view of the current user to every page.
 * Deliberately omits tokens, ids and anything else the browser has no need for.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) return { currentUser: null };

	// Drives the "Connect Hackatime" button in the nav — a boolean, no tokens.
	const hackatime = await connectionStatus(locals.user.id);

	return {
		currentUser: {
			displayName: locals.user.display_name,
			isReviewer: locals.user.role === 'reviewer' || locals.user.role === 'admin',
			isAdmin: locals.user.role === 'admin',
			hackatimeConnected: hackatime.connected
		}
	};
};
