import type { Actions, PageServerLoad } from './$types';
import { requireUser } from '$lib/server/guards';
import { getBalance, listOwnClaims, challengeStatus, poolStatus } from '$lib/server/queries';
import { grants } from '$lib/data';
import { catalogueFor, claimFromForm } from '$lib/server/shop';

/**
 * Spending approved hours. The catalogue is `drops` from src/lib/data.ts —
 * the same list the public rewards page shows — keyed by its hour tier.
 * Cost and name are always taken from that catalogue server-side, never from
 * the form, so a tampered request can't invent a cheaper price.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals, '/claim');

	const [balance, claims, challenge, pool] = await Promise.all([getBalance(user.id), listOwnClaims(user.id), challengeStatus(user.id), poolStatus(user.id)]);

	// how many of each drop they've claimed; buying one again is fine
	const taken = new Map<string, number>();
	for (const c of claims) if (c.status !== 'cancelled') taken.set(c.reward_key, (taken.get(c.reward_key) ?? 0) + 1);

	return {
		balance,
		claims,
		catalogue: catalogueFor(Number(balance.hours_available), taken),
		grants: grants.map((g) => ({ ...g, claimed: taken.get(g.key) ?? 0 })),
		challenge,
		pool,
		flash: url.searchParams.get('claimed')
	};
};

export const actions: Actions = {
	claim: async ({ request, locals }) => claimFromForm(requireUser(locals), await request.formData())
};
