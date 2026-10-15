import { db } from './supabase';
import { drops, TRAVEL_RATE } from '$lib/data';
import { REVIEW_PAY_USD, BUDGET_PER_HOUR_USD } from './payouts';

/**
 * Where the program budget goes. Every approved build hour brings in $8.50.
 * An hour spent in the shop costs what the item's worth ($5/h, so $3.50 is
 * kept); every other approved hour is counted as going to travel at $8/h
 * ($0.50 kept). Reviewer pay and referral rewards come out on top.
 * Real Hack Club accounts only; test accounts never count.
 */
export async function programBudget() {
	const [{ data: users }, { data: approved }, { data: claims }, { data: payouts }, { data: referrals }] = await Promise.all([
		db().from('users').select('id, hackclub_id'),
		db().from('hour_transactions').select('user_id, amount').eq('type', 'checkpoint_approved'),
		db().from('reward_claims').select('user_id, reward_key, hours_cost, status').neq('status', 'cancelled'),
		db().from('review_payouts').select('reviewer_id, amount, paid_as'),
		db().from('referral_rewards').select('referrer_id, referred_id, amount_cents, status').eq('status', 'earned')
	]);
	const real = new Set((users ?? []).filter((u) => u.hackclub_id?.startsWith('ident!')).map((u) => u.id));
	const r2 = (n: number) => Math.round(n * 100) / 100;

	const approvedHours = r2((approved ?? []).filter((t) => real.has(t.user_id)).reduce((s, t) => s + Number(t.amount), 0));
	const shop = (claims ?? []).filter((c) => real.has(c.user_id));
	const shopHours = r2(shop.reduce((s, c) => s + Number(c.hours_cost), 0));
	// what the items actually cost: the catalogue value, else $5/h
	const shopUsd = r2(
		shop.reduce((s, c) => s + (drops.find((d) => String(d.hours) === c.reward_key)?.value ?? Number(c.hours_cost) * 5), 0)
	);
	const travelHours = r2(Math.max(0, approvedHours - shopHours));
	const travelUsd = r2(travelHours * TRAVEL_RATE);
	const reviewerUsd = r2(
		(payouts ?? [])
			.filter((p) => real.has(p.reviewer_id))
			.reduce((s, p) => s + (p.paid_as === 'cash' ? REVIEW_PAY_USD : Number(p.amount ?? 0) * TRAVEL_RATE), 0)
	);
	const referralUsd = r2(
		(referrals ?? []).filter((r) => real.has(r.referrer_id) && real.has(r.referred_id)).reduce((s, r) => s + r.amount_cents / 100, 0)
	);

	const grossUsd = r2(approvedHours * BUDGET_PER_HOUR_USD);
	const givenUsd = r2(shopUsd + travelUsd + reviewerUsd + referralUsd);
	const keptUsd = r2(grossUsd - givenUsd);
	const pct = (n: number) => (grossUsd ? Math.round((n / grossUsd) * 1000) / 10 : 0);
	return {
		approvedHours,
		grossUsd,
		shop: { hours: shopHours, usd: shopUsd, keptUsd: r2(shopHours * BUDGET_PER_HOUR_USD - shopUsd) },
		travel: { hours: travelHours, usd: travelUsd, keptUsd: r2(travelHours * BUDGET_PER_HOUR_USD - travelUsd) },
		reviewerUsd,
		referralUsd,
		givenUsd,
		keptUsd,
		givenPct: pct(givenUsd),
		keptPct: pct(keptUsd)
	};
}
