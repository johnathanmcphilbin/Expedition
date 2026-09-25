import { json, type RequestHandler } from '@sveltejs/kit';
import { countBuilders } from '$lib/server/queries';

/**
 * Public and deliberately tiny: one number, nothing about who. The homepage
 * polls it to keep its counter live. Cached briefly at the edge so a busy
 * homepage doesn't turn into a database query per visitor per poll.
 */
export const GET: RequestHandler = async ({ setHeaders }) => {
	setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=15, stale-while-revalidate=30' });
	return json({ builders: await countBuilders() });
};
