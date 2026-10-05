import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/guards';
import {
	listUsersWithBalances,
	grantHours,
	countPendingReviews,
	listAllClaims,
	fulfilClaim,
	cancelClaim,
	setTravelLock,
	listAllTravelBuckets
} from '$lib/server/queries';
import { countAwaitingModeration } from '$lib/server/checkpoints';
import { countQueuePending } from '$lib/server/queue';
import { getActivityStats, getOverviewStats, getReviewAnalytics } from '$lib/server/stats';
import { signedHours, text, oneOf, uuid, ValidationError } from '$lib/server/validate';
import { db } from '$lib/server/supabase';

// travel moves need a bucket and go through move_travel_hours, not here
const GRANT_TYPES = ['manual_adjustment', 'reward_claimed'] as const;

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);

	const [users, pendingOld, pendingNew, claims, buckets, sharedWaiting, overview, progress, subs, approvedReviews] = await Promise.all([
		listUsersWithBalances(),
		countPendingReviews(),
		countQueuePending(),
		listAllClaims(),
		listAllTravelBuckets(),
		countAwaitingModeration(),
		getOverviewStats(),
		// approved build hours only (checkpoint_approved), same figure as the 40h milestone
		db().from('user_expedition_progress').select('user_id, hours_earned'),
		db().from('hackclub_submissions').select('user_id, email, airtable_created_at').order('airtable_created_at', { ascending: false }),
		db()
			.from('submission_reviews')
			.select('user_id, hackatime_project, hackatime_projects, approved_hours, reviewed_at')
			.eq('status', 'approved')
			.order('reviewed_at', { ascending: true })
	]);

	// what each person's approved hours came from
	const projectsBy = new Map<string, { name: string; hours: number }[]>();
	for (const r of approvedReviews.data ?? []) {
		const list = projectsBy.get(r.user_id) ?? [];
		list.push({
			name: (r.hackatime_projects?.length ? r.hackatime_projects : [r.hackatime_project]).join(' + '),
			hours: Number(r.approved_hours ?? 0)
		});
		projectsBy.set(r.user_id, list);
	}

	const travelBuckets = Object.fromEntries(buckets.map((b) => [b.user_id, b]));
	const approvedBy = new Map((progress.data ?? []).map((p) => [p.user_id as string, Number(p.hours_earned)]));
	const typedEmail = new Map<string, string>();
	for (const s of subs.data ?? []) if (s.user_id && s.email && !typedEmail.has(s.user_id)) typedEmail.set(s.user_id, s.email);

	// Only people with approved hours, and where those hours have gone.
	const builders = users
		.filter((u) => (approvedBy.get(u.id) ?? 0) > 0)
		.map((u) => {
			const approved = approvedBy.get(u.id) ?? 0;
			const live = claims.filter((c) => c.user_id === u.id && c.status !== 'cancelled');
			const rewards = live.reduce((sum, c) => sum + Number(c.hours_cost), 0);
			const travel = Number(u.balance.hours_travel);
			const available = Number(u.balance.hours_available);
			const round = (n: number) => Math.round(n * 100) / 100;
			return {
				id: u.id,
				name: u.display_name ?? 'Unnamed',
				email: u.email ?? typedEmail.get(u.id) ?? null,
				approved,
				projects: projectsBy.get(u.id) ?? [],
				rewards: round(rewards),
				rewardItems: live.map((c) => ({ name: c.reward_name, status: c.status })),
				travel,
				travelLocked: !!u.travel_locked_at,
				buckets: travelBuckets[u.id] ?? null,
				available,
				// anything the ledger has that isn't approval / claims / travel
				adjustments: round(available - (approved - rewards - travel))
			};
		})
		.sort((a, b) => b.approved - a.approved);

	return {
		users,
		builders,
		pendingReviews: pendingOld + pendingNew,
		claims,
		travelBuckets,
		sharedWaiting,
		overview,
		analytics: getReviewAnalytics().catch((e) => {
			console.error('review analytics', e);
			return null;
		}),
		// streamed: the page renders straight away and this fills in when
		// every builder's Hackatime has answered
		activity: getActivityStats().catch((e) => {
			console.error('activity stats', e);
			return null;
		})
	};
};

export const actions: Actions = {
	/**
	 * Freeze a participant's travel fund once their trip is being arranged —
	 * after that they can't move hours in or out of it themselves.
	 */
	travelLock: async ({ request, locals }) => {
		requireAdmin(locals);
		const form = await request.formData();
		try {
			const userId = uuid(form.get('user_id')?.toString(), 'user');
			await setTravelLock(userId, form.get('locked') === 'yes');
			return { success: true };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message });
			throw e;
		}
	},

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
				return fail(400, { message: 'That amount and type don’t match. Check the sign.' });
			}
			throw e;
		}
	}
};
