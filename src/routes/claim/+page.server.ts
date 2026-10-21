import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireUser } from '$lib/server/guards';
import { getBalance, claimReward, listOwnClaims, challengeStatus, awardChallenge } from '$lib/server/queries';
import { drops, dropKey, grants, GRANT_RATE, money, CHALLENGE } from '$lib/data';
import { text, ValidationError } from '$lib/server/validate';
import { notifyClaim } from '$lib/server/notify';

/**
 * Spending approved hours. The catalogue is `drops` from src/lib/data.ts —
 * the same list the public rewards page shows — keyed by its hour tier.
 * Cost and name are always taken from that catalogue server-side, never from
 * the form, so a tampered request can't invent a cheaper price.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals, '/claim');

	const [balance, claims, challenge] = await Promise.all([getBalance(user.id), listOwnClaims(user.id), challengeStatus(user.id)]);

	// how many of each drop they've claimed; buying one again is fine
	const taken = new Map<string, number>();
	for (const c of claims) if (c.status !== 'cancelled') taken.set(c.reward_key, (taken.get(c.reward_key) ?? 0) + 1);

	return {
		balance,
		claims,
		catalogue: drops.filter((d) => !d.finisher).sort((a, b) => a.hours - b.hours).map((d) => ({
			key: dropKey(d),
			name: d.name,
			extra: d.extra ?? null,
			about: d.about ?? null,
			image: d.image ?? null,
			merch: !!d.merch,
			hours: d.hours,
			value: d.value,
			affordable: Number(balance.hours_available) >= d.hours,
			claimed: taken.get(dropKey(d)) ?? 0
		})),
		grants: grants.map((g) => ({ ...g, claimed: taken.get(g.key) ?? 0 })),
		challenge,
		flash: url.searchParams.get('claimed')
	};
};

/** After a purchase: the challenge prize, if this one got them there. */
async function checkChallenge(user: { id: string; display_name: string | null }): Promise<boolean> {
	const won = await awardChallenge(user.id);
	if (won && CHALLENGE) await notifyClaim({ name: user.display_name, reward: `Challenge prize: ${CHALLENGE.prize}`, hours: 0, note: null }).catch(() => {});
	return won;
}

export const actions: Actions = {
	claim: async ({ request, locals }) => {
		const user = requireUser(locals);
		const form = await request.formData();

		try {
			const key = text(form.get('reward_key'), 'Reward', { max: 20, required: true })!;
			const note = text(form.get('note'), 'Note', { max: 500 });

			// a grant: a set price, priced from their cost, or hours they choose; the rate is ours
			const grant = grants.find((g) => g.key === key);
			if (grant) {
				let hours: number;
				if (grant.hours) {
					hours = grant.hours;
				} else if (grant.byCost) {
					const cost = Number(form.get('cost'));
					if (!Number.isInteger(cost) || cost < 1 || cost > 1000) return fail(400, { message: 'Put in what it will cost, in whole dollars.' });
					if (!note) return fail(400, { message: "Say what you're building and what the money is for." });
					hours = Math.round((cost / GRANT_RATE) * 100) / 100;
				} else {
					hours = Number(form.get('hours'));
					if (!Number.isInteger(hours) || hours < 1 || hours > 100) return fail(400, { message: 'Pick a whole number of hours, at least 1.' });
				}
				const name = grant.hours ? grant.name : `${grant.name} (${money(hours * GRANT_RATE)})`;
				const result = await claimReward({ userId: user.id, rewardKey: grant.key, rewardName: name, hoursCost: hours, note });
				if (!result.ok) return fail(409, { message: result.message });
				await notifyClaim({ name: user.display_name, reward: name, hours, note });
				return { success: true, claimed: name, wonChallenge: await checkChallenge(user) };
			}

			// price and name come from the catalogue, never the form
			const drop = drops.find((d) => dropKey(d) === key && !d.finisher);
			if (!drop) return fail(400, { message: 'That reward does not exist.' });

			const result = await claimReward({
				userId: user.id,
				rewardKey: key,
				rewardName: drop.extra ? `${drop.name} + ${drop.extra}` : drop.name,
				hoursCost: drop.hours,
				note
			});

			if (!result.ok) return fail(409, { message: result.message });
			await notifyClaim({
				name: user.display_name,
				reward: drop.extra ? `${drop.name} + ${drop.extra}` : drop.name,
				hours: drop.hours,
				note
			});
			return { success: true, claimed: drop.name, wonChallenge: await checkChallenge(user) };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message, field: e.field });
			throw e;
		}
	}
};
