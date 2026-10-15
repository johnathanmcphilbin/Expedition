import { db } from './supabase';
import type { UserRow } from './database.types';
import { isReviewerOnly } from './guards';
import { TRAVEL_RATE } from '$lib/data';

/** Program budget per approved build hour. */
export const BUDGET_PER_HOUR_USD = 8.5;

/** What a non-admin reviewer earns per submission they decide. */
export const REVIEW_PAY_USD = 1.5;
const PER_REVIEW_HOURS = REVIEW_PAY_USD / TRAVEL_RATE; // 0.1875h

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * Pay a reviewer for a decision on a submission that was waiting for one.
 * Every round counts: a resubmission puts it back to waiting, so the next
 * decision pays again. Changing an already-decided submission (no new
 * round) doesn't, so decisions can't be flipped back and forth for pay.
 * `round` identifies the waiting period (the row's updated_at before the
 * decision), so a double click within one round still pays once.
 *
 * The ledger keeps two decimals, so each payout is the difference between
 * their running totals: 0.19, 0.18, 0.19, 0.19… adding up to exactly $1.50 each.
 */
export async function payForReview(
	reviewer: UserRow,
	kind: 'hc' | 'new',
	key: string,
	project: string,
	wasWaiting: boolean,
	round: string
): Promise<void> {
	if (!isReviewerOnly(reviewer) || !wasWaiting) return;
	const roundKey = `${key}@${round}`;

	// paid in cash by an organiser: record it as owed, credit no hours
	if (reviewer.review_pay === 'cash') {
		await db()
			.from('review_payouts')
			.upsert(
				{ item_kind: kind, item_key: roundKey, reviewer_id: reviewer.id, paid_as: 'cash' },
				{ onConflict: 'item_kind,item_key', ignoreDuplicates: true }
			);
		return;
	}

	// claim the payout first: a second request for the same round stops here
	const { data: claimed, error } = await db()
		.from('review_payouts')
		.upsert({ item_kind: kind, item_key: roundKey, reviewer_id: reviewer.id }, { onConflict: 'item_kind,item_key', ignoreDuplicates: true })
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
		await db().from('review_payouts').delete().eq('item_kind', kind).eq('item_key', roundKey);
		throw new Error(`Couldn't pay for review: ${tx.error.message}`);
	}
	await db().from('review_payouts').update({ amount }).eq('item_kind', kind).eq('item_key', roundKey);
}

/** How many reviews someone has been paid for, and the total. */
export async function reviewEarnings(reviewerId: string): Promise<{ reviews: number; usd: number }> {
	const { count } = await db()
		.from('review_payouts')
		.select('*', { count: 'exact', head: true })
		.eq('reviewer_id', reviewerId);
	return { reviews: count ?? 0, usd: (count ?? 0) * REVIEW_PAY_USD };
}

/** What each reviewer has earned, how it was paid, and the cash still owed. */
export async function reviewerPay() {
	const [{ data: staff }, { data: rows }, { data: approvals }, { data: testAccounts }] = await Promise.all([
		db().from('users').select('id, display_name, role, review_pay').in('role', ['reviewer', 'admin']),
		db().from('review_payouts').select('reviewer_id, amount, paid_as, cash_paid_at'),
		// every approval (both review paths) lands here with who approved it
		db().from('submission_reviews').select('reviewer_id, approved_hours').eq('status', 'approved').not('reviewer_id', 'is', null),
		db().from('users').select('id').not('hackclub_id', 'like', 'ident!%')
	]);
	const test = new Set((testAccounts ?? []).map((u) => u.id));
	const ids = new Set([
		...(staff ?? []).map((s) => s.id),
		...(rows ?? []).map((r) => r.reviewer_id),
		...(approvals ?? []).map((a) => a.reviewer_id as string)
	]);
	return [...ids]
		.filter((id) => !test.has(id))
		.map((id) => {
			const who = (staff ?? []).find((s) => s.id === id);
			const mine = (rows ?? []).filter((r) => r.reviewer_id === id);
			const hoursRows = mine.filter((r) => r.paid_as !== 'cash');
			const cashRows = mine.filter((r) => r.paid_as === 'cash');
			const hours = Math.round(hoursRows.reduce((t, r) => t + Number(r.amount ?? 0), 0) * 100) / 100;
			const cashPaid = cashRows.filter((r) => r.cash_paid_at).length;
			const approvedHours =
				Math.round((approvals ?? []).filter((a) => a.reviewer_id === id).reduce((t, a) => t + Number(a.approved_hours ?? 0), 0) * 100) / 100;
			return {
				approvedHours,
				// program budget those approvals bring in, at $8.50 per approved hour
				budgetUsd: Math.round(approvedHours * BUDGET_PER_HOUR_USD * 100) / 100,
				id,
				name: who?.display_name ?? 'Former reviewer',
				pay: (who?.review_pay ?? 'hours') as 'hours' | 'cash',
				reviews: mine.length,
				hours,
				hoursUsd: Math.round(hours * TRAVEL_RATE * 100) / 100,
				cashEarnedUsd: cashRows.length * REVIEW_PAY_USD,
				cashPaidUsd: cashPaid * REVIEW_PAY_USD,
				owedUsd: (cashRows.length - cashPaid) * REVIEW_PAY_USD
			};
		})
		.filter((r) => r.reviews > 0 || r.approvedHours > 0 || r.pay === 'cash')
		.sort((a, b) => b.owedUsd - a.owedUsd || b.budgetUsd - a.budgetUsd || b.reviews - a.reviews);
}

/** Record that an organiser has paid a cash reviewer everything they're owed. */
export async function markReviewerPaid(reviewerId: string): Promise<number> {
	const { data } = await db()
		.from('review_payouts')
		.update({ cash_paid_at: new Date().toISOString() })
		.eq('reviewer_id', reviewerId)
		.eq('paid_as', 'cash')
		.is('cash_paid_at', null)
		.select('item_key');
	return data?.length ?? 0;
}
