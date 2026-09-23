import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireUser } from '$lib/server/guards';
import { getBalance, claimReward, listOwnClaims } from '$lib/server/queries';
import { drops } from '$lib/data';
import { text, ValidationError } from '$lib/server/validate';

/**
 * Spending approved hours. The catalogue is `drops` from src/lib/data.ts —
 * the same list the public rewards page shows — keyed by its hour tier.
 * Cost and name are always taken from that catalogue server-side, never from
 * the form, so a tampered request can't invent a cheaper price.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals, '/claim');

	const [balance, claims] = await Promise.all([getBalance(user.id), listOwnClaims(user.id)]);

	// one live claim per tier — claiming the same drop twice isn't a thing
	const taken = new Set(
		claims.filter((c) => c.status !== 'cancelled').map((c) => c.reward_key)
	);

	return {
		balance,
		claims,
		catalogue: drops.map((d) => ({
			key: String(d.hours),
			name: d.name,
			extra: d.extra ?? null,
			hours: d.hours,
			value: d.value,
			affordable: Number(balance.hours_available) >= d.hours,
			claimed: taken.has(String(d.hours))
		})),
		flash: url.searchParams.get('claimed')
	};
};

export const actions: Actions = {
	claim: async ({ request, locals }) => {
		const user = requireUser(locals);
		const form = await request.formData();

		try {
			const key = text(form.get('reward_key'), 'Reward', { max: 20, required: true })!;
			const note = text(form.get('note'), 'Note', { max: 500 });

			// price and name come from the catalogue, never the form
			const drop = drops.find((d) => String(d.hours) === key);
			if (!drop) return fail(400, { message: 'That reward does not exist.' });

			const existing = await listOwnClaims(user.id);
			if (existing.some((c) => c.reward_key === key && c.status !== 'cancelled')) {
				return fail(409, { message: "You've already claimed that one." });
			}

			const result = await claimReward({
				userId: user.id,
				rewardKey: key,
				rewardName: drop.extra ? `${drop.name} + ${drop.extra}` : drop.name,
				hoursCost: drop.hours,
				note
			});

			if (!result.ok) return fail(409, { message: result.message });
			return { success: true, claimed: drop.name };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message, field: e.field });
			throw e;
		}
	}
};
