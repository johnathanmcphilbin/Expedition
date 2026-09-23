import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/guards';
import { listReviewQueue } from '$lib/server/queries';

export const load: PageServerLoad = async ({ locals }) => {
	// Admin only — 404s for anyone else, the route does not acknowledge itself.
	requireAdmin(locals);
	return { queue: await listReviewQueue() };
};
