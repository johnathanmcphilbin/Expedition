import { fail } from '@sveltejs/kit';
import { drops, dropKey, grants, grantRate, money, shopItems, CHALLENGE, POOL } from '$lib/data';
import type { UserRow } from './database.types';
import { awardChallenge, claimReward, poolStatus } from './queries';
import { notifyClaim } from './notify';
import { text, ValidationError } from './validate';

/**
 * One shop claim, from the form on /claim or an item page.
 * Price and name come from the catalogue, never the form.
 */
export async function claimFromForm(user: UserRow, form: FormData) {
	try {
		const key = text(form.get('reward_key'), 'Reward', { max: 20, required: true })!;
		const note = text(form.get('note'), 'Note', { max: 500 });

		// hours into the collective pot, never past the goal
		if (POOL && key === POOL.key) {
			const hours = Number(form.get('hours'));
			if (!Number.isInteger(hours) || hours < 1) return fail(400, { message: 'Pick a whole number of hours, at least 1.' });
			const status = await poolStatus(user.id);
			const left = POOL.goal - (status?.raised ?? 0);
			if (left <= 0) return fail(409, { message: `It's already at ${POOL.goal}h. Thanks!` });
			if (hours > left) return fail(400, { message: `Only ${Math.ceil(left)}h left to reach the goal.` });
			const name = `${POOL.name} (${hours}h)`;
			const result = await claimReward({ userId: user.id, rewardKey: POOL.key, rewardName: name, hoursCost: hours, note });
			if (!result.ok) return fail(409, { message: result.message });
			await notifyClaim({ name: user.display_name, reward: name, hours, note });
			return { success: true, claimed: name, pooled: hours, wonChallenge: await checkChallenge(user) };
		}

		// a grant: a set price, or hours they choose; the rate is ours
		const grant = grants.find((g) => g.key === key);
		if (grant) {
			let hours: number;
			if (grant.hours) {
				hours = grant.hours;
			} else {
				hours = Number(form.get('hours'));
				if (!Number.isInteger(hours) || hours < 1 || hours > 200) return fail(400, { message: 'Pick a whole number of hours, at least 1.' });
			}
			if (grant.needsNote && !note) return fail(400, { message: "Say what you're building and what you need." });
			const name = grant.hours ? grant.name : `${grant.name} (${money(hours * grantRate(grant))})`;
			const result = await claimReward({ userId: user.id, rewardKey: grant.key, rewardName: name, hoursCost: hours, note });
			if (!result.ok) return fail(409, { message: result.message });
			await notifyClaim({ name: user.display_name, reward: name, hours, note });
			return { success: true, claimed: name, wonChallenge: await checkChallenge(user) };
		}

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

/** After a purchase: the challenge prize, if this one got them there. */
async function checkChallenge(user: { id: string; display_name: string | null }): Promise<boolean> {
	const won = await awardChallenge(user.id);
	if (won && CHALLENGE) await notifyClaim({ name: user.display_name, reward: `Challenge prize: ${CHALLENGE.prize}`, hours: 0, note: null }).catch(() => {});
	return won;
}

/** Catalogue rows plus whether this person can afford another, and how many they already claimed. */
export function catalogueFor(hoursAvailable: number, taken: Map<string, number>) {
	return shopItems().map((d) => ({
		...d,
		affordable: hoursAvailable >= d.hours,
		claimed: taken.get(d.key) ?? 0
	}));
}
