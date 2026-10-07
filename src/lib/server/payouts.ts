import { db } from './supabase';
import type { UserRow } from './database.types';
import { isReviewerOnly } from './guards';
import { TRAVEL_RATE } from '$lib/data';

/** What a non-admin reviewer earns per submission they decide. */
export const REVIEW_PAY_USD = 1.5;
const PER_REVIEW_HOURS = REVIEW_PAY_USD / TRAVEL_RATE; // 0.1875h

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * Pay a reviewer for deciding a submission, once per submission. The ledger
 * keeps two decimals, so each payout is the difference between their
 * running totals: 0.19, 0.18, 0.19, 0.19… adding up to exactly $1.50 each.
 */
export async function payForReview(reviewer: UserRow, kind: 'hc' | 'new', key: string, project: string): Promise<void> {
	if (!isReviewerOnly(reviewer)) return;

	// claim the payout first: a second decision on the same submission stops here
	const { data: claimed, error } = await db()
		.from('review_payouts')
		.upsert({ item_kind: kind, item_key: key, reviewer_id: reviewer.id }, { onConflict: 'item_kind,item_key', ignoreDuplicates: true })
		.select('item_key');
	if (error) throw new Error(`Couldn't record review payout: ${error.message}`);
	if (!claimed?.length) return;

	const { count } = await db()
		.from('review_payouts')
		.select('*', { count: 'exact', head: true })
		.eq('reviewer_id', reviewer.id);
	const n = count ?? 1;
	const amount = cents(cents(n * PER_REVIEW_HOURS) - cents((n - 1) * PER_REVIEW_HOURS));

	const tx = await db()
		.from('hour_transactions')
		.insert({ user_id: reviewer.id, amount, type: 'manual_adjustment', note: `Review reward ($${REVIEW_PAY_USD}): ${project}`.slice(0, 500) });
	if (tx.error) {
		// undo the claim so the next decision can pay it
		await db().from('review_payouts').delete().eq('item_kind', kind).eq('item_key', key);
		throw new Error(`Couldn't pay for review: ${tx.error.message}`);
	}
	await db().from('review_payouts').update({ amount }).eq('item_kind', kind).eq('item_key', key);
}

/** How many reviews someone has been paid for, and the total. */
export async function reviewEarnings(reviewerId: string): Promise<{ reviews: number; usd: number }> {
	const { count } = await db()
		.from('review_payouts')
		.select('*', { count: 'exact', head: true })
		.eq('reviewer_id', reviewerId);
	return { reviews: count ?? 0, usd: (count ?? 0) * REVIEW_PAY_USD };
}
