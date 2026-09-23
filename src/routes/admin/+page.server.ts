import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/guards';
import {
	listUsersWithBalances,
	grantHours,
	countPendingReviews,
	listAllClaims,
	fulfilClaim,
	cancelClaim
} from '$lib/server/queries';
import { signedHours, text, oneOf, uuid, ValidationError } from '$lib/server/validate';

const GRANT_TYPES = ['manual_adjustment', 'reward_claimed', 'travel_allocation'] as const;

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);

	const [users, pendingReviews, claims] = await Promise.all([
		listUsersWithBalances(),
		countPendingReviews(),
		listAllClaims()
	]);

	return { users, pendingReviews, claims };
};

export const actions: Actions = {
	/** Mark a claim as sent. No ledger effect — the debit happened at claim time. */
	fulfil: async ({ request, locals }) => {
		requireAdmin(locals);
		const form = await request.formData();
		try {
			const claimId = uuid(form.get('claim_id')?.toString(), 'claim');
			await fulfilClaim(claimId, text(form.get('admin_notes'), 'Notes', { max: 500 }));
			return { success: true };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message });
			throw e;
		}
	},

	/**
	 * Cancel a claim and refund it. The original debit is immutable, so this
	 * writes a compensating credit rather than deleting anything.
	 */
	cancel: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const form = await request.formData();
		try {
			const claimId = uuid(form.get('claim_id')?.toString(), 'claim');
			const result = await cancelClaim(
				claimId,
				admin.id,
				text(form.get('admin_notes'), 'Notes', { max: 500 })
			);
			if (!result.ok) return fail(409, { message: result.message });
			return { success: true };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message });
			throw e;
		}
	},

	/**
	 * A free-standing ledger entry outside the claim flow — a travel
	 * allocation, or a correction (either sign). The type decides the sign:
	 * reward_claimed/travel_allocation are always entered as a positive number
	 * of hours to take away and stored negative, matching the database's own
	 * sign-matches-type constraint, which is the real guard here — this only
	 * makes the form intuitive.
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
