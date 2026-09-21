import { db } from './supabase';
import type { ReviewDecision } from './database.types';

/**
 * Submit a review decision.
 *
 * All of the dangerous logic lives in the `review_submission` Postgres function
 * (see supabase/migrations/0002_review_submission.sql): permission check,
 * self-review check, already-decided check, review insert, status update and the
 * ledger credit all happen in ONE transaction.
 *
 * `reviewerId` comes from the server session. The client cannot influence who
 * the reviewer is, nor what role they hold — the function re-reads the role from
 * the database itself.
 */

export type ReviewOutcome =
	| { ok: true; reviewId: string }
	| { ok: false; message: string };

export async function submitReview(params: {
	submissionId: string;
	reviewerId: string;
	decision: ReviewDecision;
	hoursApproved: number | null;
	feedback: string | null;
}): Promise<ReviewOutcome> {
	const { data, error } = await db().rpc('review_submission', {
		p_submission_id: params.submissionId,
		p_reviewer_id: params.reviewerId,
		p_decision: params.decision,
		p_hours_approved: params.decision === 'approved' ? params.hoursApproved : null,
		p_feedback: params.feedback
	});

	if (error) {
		// A retry or double-click races into the unique indexes
		// (reviews_one_approval_per_submission / hour_transactions_one_credit_per_submission).
		// Report it as already-handled rather than surfacing a database error.
		if (error.code === '23505' || /already/i.test(error.message)) {
			return { ok: false, message: 'This submission has already been decided.' };
		}
		if (error.code === '42501') {
			return { ok: false, message: error.message };
		}
		return { ok: false, message: 'Could not record that review. Try again.' };
	}

	return { ok: true, reviewId: data as unknown as string };
}
