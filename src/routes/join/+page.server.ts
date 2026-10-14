import type { PageServerLoad } from './$types';
import { handleJoin } from '$lib/server/referrals';

/**
 * /join?ref=CODE: counts the click, remembers the code (first touch, 30
 * days) for someone not yet in Expedition, then sends them to sign in.
 */
export const load: PageServerLoad = async ({ url, cookies, locals, setHeaders }) => {
	setHeaders({ 'cache-control': 'no-store' });
	const outcome = await handleJoin(cookies, locals.user, url.searchParams.get('ref'));
	return outcome;
};
