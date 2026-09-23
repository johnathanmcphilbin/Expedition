import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/guards';
import { listUsersWithBalances, grantHours, countPendingReviews } from '$lib/server/queries';
import { signedHours, text, oneOf, uuid, ValidationError } from '$lib/server/validate';

const GRANT_TYPES = ['manual_adjustment', 'reward_claimed', 'travel_allocation'] as const;

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);

	const [users, pendingReviews] = await Promise.all([listUsersWithBalances(), countPendingReviews()]);

	return { users, pendingReviews };
};

export const actions: Actions = {
	/**
	 * A free-standing ledger entry — fulfilling an Airtable claim (deduct),
	 * a travel allocation (deduct), or a correction (either sign). The type
	 * decides the sign: reward_claimed/travel_allocation are always entered as
	 * a positive number of hours to take away and stored negative, matching
	 * the database's own sign-matches-type constraint, which is the real
	 * guard here — this only makes the form intuitive.
	 */
	grant: async ({ request, locals }) => {
		requireAdmin(locals);
		const form = await request.formData();

		try {
			const userId = uuid(form.get('user_id')?.toString(), 'user');
			const type = oneOf(form.get('type'), GRANT_TYPES, 'Type');
			const rawAmount = signedHours(form.get('amount'), 'Amount');
			const note = text(form.get('note'), 'Note', { max: 500 });

			const amount = type === 'manual_adjustment' ? rawAmount : -Math.abs(rawAmount);

			await grantHours(userId, amount, type, note);
			return { success: true };
		} catch (e) {
			if (e instanceof ValidationError) {
				return fail(400, { message: e.message, field: e.field });
			}
			if (e instanceof Error && e.message.includes('hour_transactions_sign_matches_type')) {
				return fail(400, { message: 'That amount and type don’t match — check the sign.' });
			}
			throw e;
		}
	}
};
