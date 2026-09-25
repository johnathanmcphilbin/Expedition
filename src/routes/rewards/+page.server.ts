import type { PageServerLoad } from './$types';
import { getBalance, getProgress, listOwnClaims } from '$lib/server/queries';

/**
 * Signed in, the trail shows your real ledger; signed out it stays a preview
 * you can scrub through.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) return { live: null };

	const [balance, progress, claims] = await Promise.all([
		getBalance(locals.user.id),
		getProgress(locals.user.id),
		listOwnClaims(locals.user.id)
	]);

	return {
		live: {
			built: Number(progress.hours_earned),
			spent: Number(balance.hours_spent),
			available: Number(balance.hours_available),
			travel: Number(balance.hours_travel),
			target: Number(progress.hours_target),
			finished: progress.finished,
			claimed: claims
				.filter((c) => c.status !== 'cancelled')
				.map((c) => Number(c.reward_key))
				.filter(Number.isFinite)
		}
	};
};
