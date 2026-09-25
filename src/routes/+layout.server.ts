import { connectionStatus } from '$lib/server/hackatime';
import { countBuilders } from '$lib/server/queries';
import type { LayoutServerLoad } from './$types';

/**
 * Exposes a minimal, non-sensitive view of the current user to every page.
 * Deliberately omits tokens, ids and anything else the browser has no need for.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	// the live counter in the nav; if it can't load it just doesn't show
	const builders = await countBuilders().catch(() => null);

	if (!locals.user) return { currentUser: null, builders };

	// Drives the "Connect Hackatime" button in the nav — a boolean, no tokens.
	const hackatime = await connectionStatus(locals.user.id);

	return {
		builders,
		currentUser: {
			displayName: locals.user.display_name,
			isAdmin: locals.user.role === 'admin',
			hackatimeConnected: hackatime.connected
		}
	};
};
