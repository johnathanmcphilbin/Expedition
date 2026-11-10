import { connectionStatus } from '$lib/server/hackatime';
import { readIrelandSettings } from '$lib/server/ireland';
import { countBuilders } from '$lib/server/queries';
import type { LayoutServerLoad } from './$types';

/**
 * Exposes a minimal, non-sensitive view of the current user to every page.
 * Deliberately omits tokens, ids and anything else the browser has no need for.
 */
export const load: LayoutServerLoad = async ({ locals, url, setHeaders }) => {
	// the live counter in the nav; if it can't load it just doesn't show
	const builders = await countBuilders().catch(() => null);

	// Homepage announcement only. A boolean: no capacity, no names.
	let irelandOpen = false;
	if (url.pathname === '/') {
		setHeaders({ 'cache-control': 'public, max-age=60' });
		try {
			irelandOpen = (await readIrelandSettings()).open;
		} catch {
			irelandOpen = false;
		}
	}

	if (!locals.user) return { currentUser: null, builders, irelandOpen };

	// Drives the "Connect Hackatime" button in the nav — a boolean, no tokens.
	const hackatime = await connectionStatus(locals.user.id);

	return {
		builders,
		irelandOpen,
		currentUser: {
			displayName: locals.user.display_name,
			isAdmin: locals.user.role === 'admin',
			isReviewer: locals.user.role === 'reviewer',
			hackatimeConnected: hackatime.connected
		}
	};
};
