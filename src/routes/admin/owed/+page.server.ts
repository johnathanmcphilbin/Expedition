import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/guards';
import { db } from '$lib/server/supabase';
import { listAllTravelBuckets, listAllClaims, challengeStatus } from '$lib/server/queries';
import { listAllTravelClaims, decideTravelClaim, payTravelClaim, createTravelClaim, BUCKETS } from '$lib/server/travel-claims';
import { reviewerPay, markReviewerPaid, BUDGET_PER_HOUR_USD } from '$lib/server/payouts';
import { programBudget } from '$lib/server/budget';
import { hcbSummary, HCB_URL } from '$lib/server/hcb';
import { listOrigins } from '$lib/server/origins';
import { estimateTrip } from '$lib/travel-estimates';
import { logAdminAction } from '$lib/server/referrals';
import { text, uuid, ValidationError } from '$lib/server/validate';
import { shopValue, TRAVEL_RATE, GRANT_RATE } from '$lib/data';

/**
 * Everything the program owes people. Travel is per claim: each claim is one
 * ask for visa, flights or accommodation money (add-ons are new claims),
 * approved and paid separately. Hours banked but not claimed yet are shown
 * as what could still come. Plus reviewer cash and shop items to send.
 */
export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	const [buckets, travelClaims, pay, shopClaims, { data: users }, { data: flights }, challenge] = await Promise.all([
		listAllTravelBuckets(),
		listAllTravelClaims(),
		reviewerPay(),
		listAllClaims(),
		db().from('users').select('id, display_name, email, hackclub_id, cant_come'),
		db().from('trip_flights').select('user_id, price_usd, status'),
		challengeStatus(null)
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
	const shopUsd = toSend.reduce((t, c) => t + shopValue(c.reward_key, Number(c.hours_cost)), 0);
	const reviewers = pay.filter((r) => r.owedUsd > 0);
	const reviewersUsd = reviewers.reduce((t, r) => t + r.owedUsd, 0);

	const order = ['requested', 'approved', 'paid', 'declined', 'withdrawn'];
	const cantComeTravelUsd = r2(
		people.filter((p) => userBy.get(p.id)?.cant_come).reduce((t, p) => t + p.owed + p.waiting + p.unclaimed, 0)
	);
	return {
		// travel banked or claimed but not paid yet: unclaimed + claimed + approved.
		// Anyone who can't come won't travel, so theirs is counted at shop prices.
		money: spendable({
			travelUsd: r2(stages.unclaimed.total + stages.requested.total + stages.approved.total - cantComeTravelUsd),
			cantComeTravelUsd,
			shopUsd: r2(shopUsd),
			reviewerCashUsd: r2(reviewersUsd)
		}).catch((e) => {
			console.error('spendable', e);
			return null;
		}),
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
		challenge,
		shop: { items: toSend.map((c) => ({ name: c.owner?.display_name ?? 'Unnamed', reward: c.reward_name })), usd: shopUsd },
		// owed now: approved travel claims + reviewer cash + shop items to send
		totalUsd: r2(stages.approved.total + reviewersUsd + shopUsd)
	};
};

/**
 * How much is yours to spend: what's in the HCB account, less everything
 * participants still hold and haven't been paid out yet. Unspent hours are
 * counted at $8 only up to what their trip (flight + visa) still needs past
 * what they've banked for it; travel money can't go past that, so the rest
 * can only go on the shop at $5 (you keep $3.50). Anyone who's bought from
 * the shop is counted at $5 throughout, and so is anyone who can't come
 * (e.g. a refused visa), travel they'd banked included. Anyone with no trip
 * estimate yet is at $8, the worst case. Shop items already bought are out of the bank
 * and ones to send are at their value, so the shop's margin is in either way.
 * Referral rewards and reviewer pay in hours are already in their balances.
 */
async function spendable(held: { travelUsd: number; cantComeTravelUsd: number; shopUsd: number; reviewerCashUsd: number }) {
	const [hcb, { data: balances }, { data: users }, budget, { data: shoppers }, origins, { data: tripClaims }, { data: flights }, buckets] = await Promise.all([
		hcbSummary(),
		db().from('user_hour_balances').select('user_id, hours_available'),
		db().from('users').select('id, cant_come').like('hackclub_id', 'ident!%'),
		programBudget(),
		db().from('reward_claims').select('user_id, hours_cost').neq('status', 'cancelled'),
		listOrigins(),
		db().from('qualification_claims').select('user_id, trip_cost_usd').eq('status', 'approved'),
		db().from('trip_flights').select('user_id, price_usd, status').neq('status', 'cancelled'),
		listAllTravelBuckets()
	]);
	const r2 = (n: number) => Math.round(n * 100) / 100;
	const real = new Set((users ?? []).map((u) => u.id));
	const cantCome = new Set((users ?? []).filter((u) => u.cant_come).map((u) => u.id));
	const shopped = new Set((shoppers ?? []).map((c) => c.user_id));
	// what each person's trip costs: a confirmed claim, else their booked flight or the estimate, plus visa
	const tripCost = new Map<string, number>();
	for (const o of origins) {
		const est = estimateTrip(o);
		const booked = (flights ?? []).find((f) => f.user_id === o.user_id && f.price_usd !== null);
		tripCost.set(o.user_id, (booked ? Number(booked.price_usd) : est.flight) + (est.visa ?? 0));
	}
	for (const c of tripClaims ?? []) if (c.trip_cost_usd !== null) tripCost.set(c.user_id, Number(c.trip_cost_usd));
	const bankedUsd = new Map(buckets.map((b) => [b.user_id, (Number(b.visa) + Number(b.flights) + Number(b.accommodation)) * TRAVEL_RATE]));

	const hours = { shop: 0, travel: 0, covered: 0, unknown: 0, cantCome: 0 };
	for (const b of balances ?? []) {
		const h = Math.max(0, Number(b.hours_available));
		if (!real.has(b.user_id) || !h) continue;
		if (cantCome.has(b.user_id)) hours.cantCome += h;
		else if (shopped.has(b.user_id)) hours.shop += h;
		else if (!tripCost.has(b.user_id)) hours.unknown += h;
		else {
			// travel can take this many more hours; the rest can only go on the shop
			const room = Math.max(0, (tripCost.get(b.user_id)! - (bankedUsd.get(b.user_id) ?? 0)) / TRAVEL_RATE);
			hours.travel += Math.min(h, room);
			hours.covered += Math.max(0, h - room);
		}
	}
	const shopperHours = r2(hours.shop);
	const travelHours = r2(hours.travel);
	const coveredHours = r2(hours.covered);
	const unknownHours = r2(hours.unknown);
	// can't come: their unspent hours, and travel they'd banked (back into hours), go on the shop
	const cantComeHours = r2(hours.cantCome + held.cantComeTravelUsd / TRAVEL_RATE);
	const unspentUsd = r2((shopperHours + coveredHours + cantComeHours) * GRANT_RATE + (travelHours + unknownHours) * TRAVEL_RATE);
	const heldUsd = r2(unspentUsd + held.travelUsd + held.shopUsd + held.reviewerCashUsd);

	// Likely, not worst case: the hours that could go either way split the way
	// everyone's spent so far, shop hours vs hours banked for travel
	const spentShop = (shoppers ?? []).filter((c) => real.has(c.user_id)).reduce((t, c) => t + Number(c.hours_cost), 0);
	const spentTravel = buckets.filter((b) => real.has(b.user_id)).reduce((t, b) => t + Number(b.visa) + Number(b.flights) + Number(b.accommodation), 0);
	const shopShare = spentShop + spentTravel ? spentShop / (spentShop + spentTravel) : 0;
	const either = travelHours + unknownHours;
	const likelyHeldUsd = r2(heldUsd - either * shopShare * (TRAVEL_RATE - GRANT_RATE));
	const hoursPaid = r2(hcb.fromHq / BUDGET_PER_HOUR_USD);
	return {
		hcb,
		hcbUrl: HCB_URL,
		shopperHours,
		travelHours,
		coveredHours,
		unknownHours,
		cantComeHours,
		cantComePeople: cantCome.size,
		shopRate: GRANT_RATE,
		unspentUsd,
		...held,
		heldUsd,
		spendUsd: r2(hcb.balance - heldUsd),
		shopSharePct: Math.round(shopShare * 100),
		spentShop: r2(spentShop),
		spentTravel: r2(spentTravel),
		likelySavingUsd: r2(heldUsd - likelyHeldUsd),
		likelyUsd: r2(hcb.balance - likelyHeldUsd),
		approved: budget.approvedHours,
		hoursPaid,
		// approved here but HQ hasn't paid for yet: approved hours less what HQ's sent / $8.50
		stillToComeHours: r2(budget.approvedHours - hoursPaid),
		stillToCome: r2((budget.approvedHours - hoursPaid) * BUDGET_PER_HOUR_USD),
		spendAfterUsd: r2(hcb.balance - heldUsd + (budget.approvedHours - hoursPaid) * BUDGET_PER_HOUR_USD),
		likelyAfterUsd: r2(hcb.balance - likelyHeldUsd + (budget.approvedHours - hoursPaid) * BUDGET_PER_HOUR_USD)
	};
}

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
