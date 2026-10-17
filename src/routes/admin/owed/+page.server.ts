import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/guards';
import { db } from '$lib/server/supabase';
import { listAllTravelBuckets, listAllClaims } from '$lib/server/queries';
import { listAllTravelClaims, decideTravelClaim, payTravelClaim, createTravelClaim, BUCKETS } from '$lib/server/travel-claims';
import { reviewerPay, markReviewerPaid } from '$lib/server/payouts';
import { logAdminAction } from '$lib/server/referrals';
import { text, uuid, ValidationError } from '$lib/server/validate';
import { drops, TRAVEL_RATE } from '$lib/data';

/**
 * Everything the program owes people. Travel is per claim: each claim is one
 * ask for visa, flights or accommodation money (add-ons are new claims),
 * approved and paid separately. Hours banked but not claimed yet are shown
 * as what could still come. Plus reviewer cash and shop items to send.
 */
export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	const [buckets, travelClaims, pay, shopClaims, { data: users }, { data: flights }] = await Promise.all([
		listAllTravelBuckets(),
		listAllTravelClaims(),
		reviewerPay(),
		listAllClaims(),
		db().from('users').select('id, display_name, email, hackclub_id'),
		db().from('trip_flights').select('user_id, price_usd, status')
	]);
	const r2 = (n: number) => Math.round(n * 100) / 100;
	const userBy = new Map((users ?? []).map((u) => [u.id, u]));
	const real = (id: string) => !!userBy.get(id)?.hackclub_id?.startsWith('ident!');
	type B = (typeof BUCKETS)[number];
	const zero = () => ({ visa: 0, flights: 0, accommodation: 0, total: 0 });
	const add = (acc: Record<B | 'total', number>, bucket: B, usd: number) => {
		acc[bucket] = r2(acc[bucket] + usd);
		acc.total = r2(acc.total + usd);
	};

	// totals by stage, across everyone
	const stages = { approved: zero(), requested: zero(), paid: zero(), unclaimed: zero() };
	for (const c of travelClaims) {
		if (c.status === 'approved' || c.status === 'requested' || c.status === 'paid') add(stages[c.status], c.bucket, Number(c.usd));
	}

	const people = buckets
		.filter((b) => real(b.user_id) && Number(b.visa) + Number(b.accommodation) + Number(b.flights) > 0)
		.map((b) => {
			const u = userBy.get(b.user_id)!;
			const mine = travelClaims.filter((c) => c.user_id === b.user_id);
			const f = (flights ?? []).find((x) => x.user_id === b.user_id && x.status !== 'cancelled');
			const sumOf = (bucket: B, st: string[]) => r2(mine.filter((c) => c.bucket === bucket && st.includes(c.status)).reduce((t, c) => t + Number(c.usd), 0));
			const unclaimed = zero();
			for (const bucket of BUCKETS) {
				const free = r2(Number(b[bucket]) * TRAVEL_RATE - sumOf(bucket, ['requested', 'approved', 'paid']));
				if (free > 0) add(unclaimed, bucket, free);
			}
			for (const bucket of BUCKETS) if (unclaimed[bucket]) add(stages.unclaimed, bucket, unclaimed[bucket]);
			const owed = r2(BUCKETS.reduce((t, x) => t + sumOf(x, ['approved']), 0));
			const waiting = r2(BUCKETS.reduce((t, x) => t + sumOf(x, ['requested']), 0));
			const paid = r2(BUCKETS.reduce((t, x) => t + sumOf(x, ['paid']), 0));
			return {
				id: b.user_id,
				name: u.display_name ?? 'Unnamed',
				email: u.email,
				banked: { visa: r2(Number(b.visa) * TRAVEL_RATE), flights: r2(Number(b.flights) * TRAVEL_RATE), accommodation: r2(Number(b.accommodation) * TRAVEL_RATE) },
				owed,
				waiting,
				paid,
				unclaimed: unclaimed.total,
				flightPrice: f?.price_usd === null || f?.price_usd === undefined ? null : Number(f.price_usd)
			};
		})
		.sort((a, b) => b.owed - a.owed || b.waiting - a.waiting || b.unclaimed - a.unclaimed);

	const toSend = shopClaims.filter((c) => c.status === 'requested');
	const shopUsd = toSend.reduce((t, c) => t + (drops.find((d) => String(d.hours) === c.reward_key)?.value ?? Number(c.hours_cost) * 5), 0);
	const reviewers = pay.filter((r) => r.owedUsd > 0);
	const reviewersUsd = reviewers.reduce((t, r) => t + r.owedUsd, 0);

	const order = ['requested', 'approved', 'paid', 'declined', 'withdrawn'];
	return {
		claims: travelClaims
			.filter((c) => c.status !== 'withdrawn')
			.map((c) => {
				// an add-on: they already had a claim for this bucket before this one
				const earlier = travelClaims.some(
					(x) => x.user_id === c.user_id && x.bucket === c.bucket && x.id !== c.id && x.requested_at < c.requested_at && ['requested', 'approved', 'paid'].includes(x.status)
				);
				return { ...c, usd: Number(c.usd), hours: Number(c.hours), name: c.owner?.display_name ?? 'Unnamed', email: c.owner?.email ?? null, addOn: earlier };
			})
			.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || (a.status === 'requested' ? a.requested_at.localeCompare(b.requested_at) : b.requested_at.localeCompare(a.requested_at))),
		people,
		stages,
		reviewers: reviewers.map((r) => ({ id: r.id, name: r.name, owedUsd: r.owedUsd })),
		reviewersUsd,
		shop: { items: toSend.map((c) => ({ name: c.owner?.display_name ?? 'Unnamed', reward: c.reward_name })), usd: shopUsd },
		// owed now: approved travel claims + reviewer cash + shop items to send
		totalUsd: r2(stages.approved.total + reviewersUsd + shopUsd)
	};
};

export const actions: Actions = {
	/** Approve or decline one travel claim. Declining needs a reason (they see it) and frees those hours. */
	decideClaim: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const form = await request.formData();
		try {
			const id = uuid(form.get('id')?.toString(), 'claim');
			const approve = form.get('decision') === 'approve';
			const note = text(form.get('admin_note'), 'Note', { max: 1000 });
			if (!approve && !note) return fail(400, { message: 'Say why, so they know what to do next.' });
			const claim = await decideTravelClaim(admin.id, id, approve, note);
			if (!claim) return fail(409, { message: 'That claim has already been decided.' });
			await logAdminAction(admin.id, approve ? 'travel_claim_approved' : 'travel_claim_declined', claim.user_id, `$${Number(claim.usd).toFixed(2)} (${claim.bucket})${note ? `: ${note}` : ''}`);
			return { done: approve ? 'Claim approved.' : 'Claim declined.' };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message });
			throw e;
		}
	},

	/**
	 * Claim someone's unclaimed banked hours for them, every bucket, without
	 * the qualify check. For when they can't (or couldn't) claim themselves.
	 * The claims land as waiting, to approve and pay as usual.
	 */
	claimFor: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const form = await request.formData();
		try {
			const userId = uuid(form.get('user_id')?.toString(), 'person');
			const made = [];
			for (const bucket of BUCKETS) {
				const c = await createTravelClaim(userId, bucket, 'Claimed by an organiser');
				if (c) made.push(c);
			}
			if (!made.length) return fail(409, { message: 'Nothing unclaimed for them.' });
			const total = made.reduce((t, c) => t + Number(c.usd), 0);
			await logAdminAction(admin.id, 'travel_claim_for', userId, made.map((c) => `$${Number(c.usd).toFixed(2)} (${c.bucket})`).join(', '));
			return { done: `Claimed $${total.toFixed(2)} for them. Approve it under Travel claims.` };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message });
			throw e;
		}
	},

	/** Money sent for one claim. */
	payClaim: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const form = await request.formData();
		try {
			const id = uuid(form.get('id')?.toString(), 'claim');
			const claim = await payTravelClaim(admin.id, id);
			if (!claim) return fail(409, { message: "That claim can't be marked paid (already paid, declined or withdrawn)." });
			await logAdminAction(admin.id, 'travel_paid', claim.user_id, `$${Number(claim.usd).toFixed(2)} (${claim.bucket})`);
			return { done: `Marked $${Number(claim.usd).toFixed(2)} paid.` };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message });
			throw e;
		}
	},

	/** Reviewer cash: everything owed to them, paid. */
	payReviewer: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const form = await request.formData();
		const id = String(form.get('user_id') ?? '');
		if (!/^[0-9a-f-]{36}$/.test(id)) return fail(400, { message: 'Invalid reviewer.' });
		const n = await markReviewerPaid(id);
		await logAdminAction(admin.id, 'reviewer_paid_cash', id, `${n} review${n === 1 ? '' : 's'}`);
		return { done: `Marked ${n} review${n === 1 ? '' : 's'} paid.` };
	}
};
