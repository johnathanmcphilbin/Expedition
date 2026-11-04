import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireUser } from '$lib/server/guards';
import { getBalance, listOwnClaims } from '$lib/server/queries';
import { shopItems } from '$lib/data';
import { claimFromForm } from '$lib/server/shop';

/** One shop item, with both photos when it has them. Claiming uses the same catalogue price as /claim. */
export const load: PageServerLoad = async ({ locals, params }) => {
	const user = requireUser(locals, `/claim/${params.key}`);
	const item = shopItems().find((d) => d.key === params.key);
	if (!item) error(404, 'Not found');
	const [balance, claims] = await Promise.all([getBalance(user.id), listOwnClaims(user.id)]);
	const claimed = claims.filter((c) => c.status !== 'cancelled' && c.reward_key === item.key).length;

	return {
		balance,
		item: {
			...item,
			affordable: Number(balance.hours_available) >= item.hours,
			claimed
		}
	};
};

export const actions: Actions = {
	claim: async ({ request, locals }) => claimFromForm(requireUser(locals), await request.formData())
};
