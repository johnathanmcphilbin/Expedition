import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/guards';
import { db } from '$lib/server/supabase';
import { listAllTravelBuckets, listAllClaims } from '$lib/server/queries';
import { listGrantRequests } from '$lib/server/grants';
import { reviewerPay, markReviewerPaid } from '$lib/server/payouts';
import { logAdminAction } from '$lib/server/referrals';
import { text, uuid, ValidationError } from '$lib/server/validate';
import { drops, TRAVEL_RATE } from '$lib/data';

/**
 * Everything the program owes people: travel stipends (what's banked in each
 * person's travel fund, by visa / flights / accommodation, at $8/h), cash
 * owed to reviewers, and shop items still to send.
 */
export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	const [buckets, grants, pay, claims, { data: users }, { data: flights }, { data: paidRows }] = await Promise.all([
		listAllTravelBuckets(),
		listGrantRequests(),
		reviewerPay(),
		listAllClaims(),
		db().from('users').select('id, display_name, email, hackclub_id, travel_locked_at'),
		db().from('trip_flights').select('user_id, price_usd, status'),
		db().from('travel_payouts').select('user_id, bucket, amount_usd, paid_at')
	]);
	const paidOf = (id: string, bucket: string) =>
		Math.round((paidRows ?? []).filter((p) => p.user_id === id && p.bucket === bucket).reduce((t, p) => t + Number(p.amount_usd), 0) * 100) / 100;
	const userBy = new Map((users ?? []).map((u) => [u.id, u]));
	const real = (id: string) => !!userBy.get(id)?.hackclub_id?.startsWith('ident!');
	const usd = (h: number) => Math.round(h * TRAVEL_RATE * 100) / 100;

	const people = buckets
		.filter((b) => real(b.user_id) && Number(b.visa) + Number(b.accommodation) + Number(b.flights) > 0)
		.map((b) => {
			const u = userBy.get(b.user_id)!;
			const g = grants.find((x) => x.user_id === b.user_id);
			const f = (flights ?? []).find((x) => x.user_id === b.user_id && x.status !== 'cancelled');
			// what's still owed in each bucket: banked minus what's been paid
			const left = (banked: number, bucket: string) => Math.max(0, Math.round((usd(banked) - paidOf(b.user_id, bucket)) * 100) / 100);
			const visa = left(Number(b.visa), 'visa');
			const flightsUsd = left(Number(b.flights), 'flights');
			const accommodation = left(Number(b.accommodation), 'accommodation');
			const paid = Math.round((paidOf(b.user_id, 'visa') + paidOf(b.user_id, 'flights') + paidOf(b.user_id, 'accommodation')) * 100) / 100;
			return {
				id: b.user_id,
				name: u.display_name ?? 'Unnamed',
				email: u.email,
				stage: (g?.status === 'approved' ? 'approved' : g?.status === 'requested' ? 'requested' : 'banked') as 'approved' | 'requested' | 'banked',
				locked: !!u.travel_locked_at,
				visa,
				flights: flightsUsd,
				accommodation,
				total: Math.round((visa + flightsUsd + accommodation) * 100) / 100,
				paid,
				flightPrice: f?.price_usd === null || f?.price_usd === undefined ? null : Number(f.price_usd)
			};
		})
		.sort((a, b) => ['approved', 'requested', 'banked'].indexOf(a.stage) - ['approved', 'requested', 'banked'].indexOf(b.stage) || b.total - a.total);

	const sum = (rows: typeof people, k: 'visa' | 'flights' | 'accommodation' | 'total') =>
		Math.round(rows.reduce((t, r) => t + r[k], 0) * 100) / 100;
	const byStage = (s: 'approved' | 'requested' | 'banked') => {
		const rows = people.filter((p) => p.stage === s);
		return { people: rows.length, visa: sum(rows, 'visa'), flights: sum(rows, 'flights'), accommodation: sum(rows, 'accommodation'), total: sum(rows, 'total') };
	};

	const toSend = claims.filter((c) => c.status === 'requested');
	const shopUsd = toSend.reduce((t, c) => t + (drops.find((d) => String(d.hours) === c.reward_key)?.value ?? Number(c.hours_cost) * 5), 0);
	const reviewers = pay.filter((r) => r.owedUsd > 0);
	const reviewersUsd = reviewers.reduce((t, r) => t + r.owedUsd, 0);

	const stages = { approved: byStage('approved'), requested: byStage('requested'), banked: byStage('banked') };
	return {
		people,
		stages,
		all: { visa: sum(people, 'visa'), flights: sum(people, 'flights'), accommodation: sum(people, 'accommodation'), total: sum(people, 'total') },
		reviewers: reviewers.map((r) => ({ id: r.id, name: r.name, owedUsd: r.owedUsd })),
		paidTotal: Math.round((paidRows ?? []).reduce((t, p) => t + Number(p.amount_usd), 0) * 100) / 100,
		reviewersUsd,
		shop: { items: toSend.map((c) => ({ name: c.owner?.display_name ?? 'Unnamed', reward: c.reward_name })), usd: shopUsd },
		// everything owed: every banked travel fund + reviewer cash + shop items to send
		totalUsd: Math.round((sum(people, 'total') + reviewersUsd + shopUsd) * 100) / 100
	};
};

export const actions: Actions = {
	/** Record travel stipend money paid to someone (one bucket, or everything still owed); locks their fund. */
	payTravel: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const form = await request.formData();
		try {
			const userId = uuid(form.get('user_id')?.toString(), 'person');
			const which = String(form.get('bucket') ?? 'all');
			const note = text(form.get('note'), 'Note', { max: 500 });
			const [{ data: b }, { data: paid }] = await Promise.all([
				db().from('user_travel_buckets').select('*').eq('user_id', userId).maybeSingle(),
				db().from('travel_payouts').select('bucket, amount_usd').eq('user_id', userId)
			]);
			if (!b) return fail(404, { message: 'No travel fund for that person.' });
			const BUCKETS = ['visa', 'flights', 'accommodation'] as const;
			const targets = which === 'all' ? BUCKETS : BUCKETS.filter((x) => x === which);
			if (!targets.length) return fail(400, { message: 'Pick what it was for.' });
			const rows = targets
				.map((bucket) => {
					const banked = Math.round(Number(b[bucket]) * TRAVEL_RATE * 100) / 100;
					const already = (paid ?? []).filter((p) => p.bucket === bucket).reduce((t, p) => t + Number(p.amount_usd), 0);
					return { user_id: userId, bucket, amount_usd: Math.round((banked - already) * 100) / 100, note, paid_by: admin.id };
				})
				.filter((r) => r.amount_usd > 0);
			if (!rows.length) return fail(409, { message: 'Nothing left to pay there.' });
			const { error } = await db().from('travel_payouts').insert(rows);
			if (error) return fail(500, { message: error.message });
			// paid out: the hours behind it can't move any more
			await db().from('users').update({ travel_locked_at: new Date().toISOString() }).eq('id', userId).is('travel_locked_at', null);
			const total = rows.reduce((t, r) => t + r.amount_usd, 0);
			await logAdminAction(admin.id, 'travel_paid', userId, `$${total.toFixed(2)} (${rows.map((r) => r.bucket).join(', ')})${note ? `: ${note}` : ''}`);
			return { done: `Marked $${total.toFixed(2)} paid.` };
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
