import type { PageServerLoad } from './$types';
import { requireReviewer } from '$lib/server/guards';
import { listReviewQueue } from '$lib/server/queries';

export const load: PageServerLoad = async ({ locals }) => {
	// 404s for participants — the route does not acknowledge itself
	requireReviewer(locals);
	return { queue: await listReviewQueue() };
};
