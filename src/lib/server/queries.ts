import { error } from '@sveltejs/kit';
import { db } from './supabase';
import type {
	MailingSignupRow,
	HackClubSubmissionRow,
	SubmissionReviewRow,
	HourTransactionRow,
	HourBalanceRow,
	ExpeditionProgressRow,
	UserRow,
	HourTransactionType
} from './database.types';

/**
 * Data access. Every function that reads or writes something owned by a
 * participant takes an explicit `userId` from the session and filters on it —
 * ownership is never inferred from a value the browser supplied.
 *
 * There is deliberately no "create a project" or "create a submission" here.
 * Hack Club's own Unified YSWS submission is the only submission; Expedition
 * only caches it (hackclub_submissions) and reviews it (submission_reviews).
 * See docs/backend.md.
 */

// ------------------------------------------------------------ mailing list -

/** Best-effort, idempotent — resubmitting the same address is a no-op. */
export async function saveMailingSignup(email: string): Promise<void> {
	const { error: e } = await db()
		.from('mailing_signups')
		.upsert({ email } satisfies Partial<MailingSignupRow>, { onConflict: 'email' });
	if (e) throw new Error(e.message);
}

// ------------------------------------------------------- hack club cache ---

/** This user's cached Hack Club submissions. Sync first if this might be stale. */
export async function listHackClubSubmissions(userId: string): Promise<HackClubSubmissionRow[]> {
	const { data, error: e } = await db()
		.from('hackclub_submissions')
		.select('*')
		.eq('user_id', userId)
		.order('airtable_created_at', { ascending: false });
	if (e) throw new Error(e.message);
	return (data ?? []) as HackClubSubmissionRow[];
}

/** Every cached submission, matched or not — for the admin queue. */
export async function listAllHackClubSubmissions(): Promise<
	(HackClubSubmissionRow & { owner: Pick<UserRow, 'display_name' | 'email'> | null })[]
> {
	const { data, error: e } = await db()
		.from('hackclub_submissions')
		.select('*, users(display_name, email)')
		.order('airtable_created_at', { ascending: false });
	if (e) throw new Error(e.message);
	return (
		(data ?? []) as unknown as (HackClubSubmissionRow & {
			users: Pick<UserRow, 'display_name' | 'email'> | null;
		})[]
	).map((r) => ({ ...r, owner: r.users }));
}

/** Throws 404 when the submission isn't in the local cache. */
export async function getHackClubSubmission(
	airtableRecordId: string
): Promise<HackClubSubmissionRow> {
	const { data } = await db()
		.from('hackclub_submissions')
		.select('*')
		.eq('airtable_record_id', airtableRecordId)
		.maybeSingle();
	if (!data) error(404, 'Submission not found');
	return data as HackClubSubmissionRow;
}

// ------------------------------------------------------------- reviews -----

/** This user's review status across their submissions, for their dashboard. */
export async function listOwnReviews(userId: string): Promise<SubmissionReviewRow[]> {
	const { data, error: e } = await db()
		.from('submission_reviews')
		.select('*')
		.eq('user_id', userId)
		.order('updated_at', { ascending: false });
	if (e) throw new Error(e.message);
	return (data ?? []) as SubmissionReviewRow[];
}

export type QueueItem = SubmissionReviewRow & {
	submission: HackClubSubmissionRow | null;
	owner: Pick<UserRow, 'display_name' | 'email'> | null;
};

/** Every review, joined to its cached submission + owner — the review queue's data. */
export async function listAllReviewsWithSubmissions(): Promise<QueueItem[]> {
	const { data, error: e } = await db()
		.from('submission_reviews')
		.select('*, hackclub_submissions(*), users!user_id(display_name, email)')
		.order('created_at', { ascending: true });
	if (e) throw new Error(e.message);
	return (
		(data ?? []) as unknown as (SubmissionReviewRow & {
			hackclub_submissions: HackClubSubmissionRow | null;
			users: Pick<UserRow, 'display_name' | 'email'> | null;
		})[]
	).map((r) => ({ ...r, submission: r.hackclub_submissions, owner: r.users }));
}

export async function getReviewForAdmin(reviewId: string): Promise<QueueItem> {
	const { data } = await db()
		.from('submission_reviews')
		.select('*, hackclub_submissions(*), users!user_id(display_name, email)')
		.eq('id', reviewId)
		.maybeSingle();
	if (!data) error(404, 'Review not found');
	const row = data as unknown as SubmissionReviewRow & {
		hackclub_submissions: HackClubSubmissionRow | null;
		users: Pick<UserRow, 'display_name' | 'email'> | null;
	};
	return { ...row, submission: row.hackclub_submissions, owner: row.users };
}

/**
 * Find or create the review row for one (submission, project) pair. Creating
 * one does not decide anything — it starts 'pending' with no hours — so this
 * is safe to call just from opening a submission to look at it.
 */
export async function getOrCreateReview(
	airtableRecordId: string,
	userId: string,
	hackatimeProject: string,
	submittedHours: number | null
): Promise<SubmissionReviewRow> {
	const existing = await db()
		.from('submission_reviews')
		.select('*')
		.eq('airtable_record_id', airtableRecordId)
		.eq('hackatime_project', hackatimeProject)
		.maybeSingle();
	if (existing.data) return existing.data as SubmissionReviewRow;

	const { data, error: e } = await db()
		.from('submission_reviews')
		.insert({
			airtable_record_id: airtableRecordId,
			user_id: userId,
			hackatime_project: hackatimeProject,
			submitted_hours: submittedHours
		})
		.select('*')
		.single();
	if (e) throw new Error(e.message);
	return data as SubmissionReviewRow;
}

export async function countPendingReviews(): Promise<number> {
	const { count } = await db()
		.from('submission_reviews')
		.select('id', { count: 'exact', head: true })
		.in('status', ['pending', 'in_review', 'changes_requested']);
	return count ?? 0;
}

// ------------------------------------------------------------------ hours ---

/** Balances are derived from the ledger view, never from a stored column. */
export async function getBalance(userId: string): Promise<HourBalanceRow> {
	const { data } = await db()
		.from('user_hour_balances')
		.select('*')
		.eq('user_id', userId)
		.maybeSingle();

	return (
		(data as HourBalanceRow | null) ?? {
			user_id: userId,
			hours_earned: 0,
			hours_spent: 0,
			hours_available: 0
		}
	);
}

/** How far around the expedition this user is — approved hours only. */
export async function getProgress(userId: string): Promise<ExpeditionProgressRow> {
	const { data } = await db()
		.from('user_expedition_progress')
		.select('*')
		.eq('user_id', userId)
		.maybeSingle();

	return (
		(data as ExpeditionProgressRow | null) ?? {
			user_id: userId,
			hours_earned: 0,
			hours_target: 40,
			checkpoints_reached: 0,
			checkpoints_total: 8,
			percent_complete: 0,
			hours_remaining: 40,
			finished: false
		}
	);
}

export async function listTransactions(userId: string): Promise<HourTransactionRow[]> {
	const { data } = await db()
		.from('hour_transactions')
		.select('*')
		.eq('user_id', userId)
		.order('created_at', { ascending: false });
	return (data ?? []) as HourTransactionRow[];
}

// ----------------------------------------------------------------- admin ---

export type AdminUser = UserRow & { balance: HourBalanceRow };

/** Every user with their derived balance, for granting hours from the roster. */
export async function listUsersWithBalances(): Promise<AdminUser[]> {
	const [{ data: users, error: ue }, { data: balances }] = await Promise.all([
		db().from('users').select('*').order('created_at', { ascending: false }),
		db().from('user_hour_balances').select('*')
	]);
	if (ue) throw new Error(ue.message);

	const byUser = new Map<string, HourBalanceRow>(
		((balances ?? []) as HourBalanceRow[]).map((b) => [b.user_id, b])
	);

	return ((users ?? []) as UserRow[]).map((u) => ({
		...u,
		balance: byUser.get(u.id) ?? {
			user_id: u.id,
			hours_earned: 0,
			hours_spent: 0,
			hours_available: 0
		}
	}));
}

/**
 * A free-standing ledger entry, outside the review flow — a correction, or a
 * reward/travel deduction agreed some other way. `checkpoint_approved` is
 * deliberately not grantable here: that type stays exclusively tied to a
 * reviewed Hack Club submission via `review_hackclub_submission()`, so every
 * hour credited that way has a submission behind it in the audit trail.
 */
export async function grantHours(
	userId: string,
	amount: number,
	type: Exclude<HourTransactionType, 'checkpoint_approved'>,
	note: string | null
): Promise<void> {
	const { error: e } = await db()
		.from('hour_transactions')
		.insert({ user_id: userId, amount, type, note });
	if (e) throw new Error(e.message);
}
