import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/guards';
import { db } from '$lib/server/supabase';
import { listAllTravelBuckets, listAllClaims } from '$lib/server/queries';
import { listGrantRequests } from '$lib/server/grants';
import { reviewerPay } from '$lib/server/payouts';
import { drops, TRAVEL_RATE } from '$lib/data';

/**
 * Everything the program owes people: travel stipends (what's banked in each
 * person's travel fund, by visa / flights / accommodation, at $8/h), cash
 * owed to reviewers, and shop items still to send.
 */
export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	const [buckets, grants, pay, claims, { data: users }, { data: flights }] = await Promise.all([
		listAllTravelBuckets(),
		listGrantRequests(),
		reviewerPay(),
		listAllClaims(),
		db().from('users').select('id, display_name, email, hackclub_id, travel_locked_at'),
		db().from('trip_flights').select('user_id, price_usd, status')
	]);
	const userBy = new Map((users ?? []).map((u) => [u.id, u]));
	const real = (id: string) => !!userBy.get(id)?.hackclub_id?.startsWith('ident!');
	const usd = (h: number) => Math.round(h * TRAVEL_RATE * 100) / 100;

	const people = buckets
		.filter((b) => real(b.user_id) && Number(b.visa) + Number(b.accommodation) + Number(b.flights) > 0)
		.map((b) => {
			const u = userBy.get(b.user_id)!;
			const g = grants.find((x) => x.user_id === b.user_id);
			const f = (flights ?? []).find((x) => x.user_id === b.user_id && x.status !== 'cancelled');
			const visa = usd(Number(b.visa));
			const flightsUsd = usd(Number(b.flights));
			const accommodation = usd(Number(b.accommodation));
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
		reviewers: reviewers.map((r) => ({ name: r.name, owedUsd: r.owedUsd })),
		reviewersUsd,
		shop: { items: toSend.map((c) => ({ name: c.owner?.display_name ?? 'Unnamed', reward: c.reward_name })), usd: shopUsd },
		// committed now: approved grants + reviewer cash + shop items to send
		committedUsd: Math.round((stages.approved.total + reviewersUsd + shopUsd) * 100) / 100,
		// if every banked travel fund ends up approved too
		worstCaseUsd: Math.round((stages.approved.total + stages.requested.total + stages.banked.total + reviewersUsd + shopUsd) * 100) / 100
	};
};
