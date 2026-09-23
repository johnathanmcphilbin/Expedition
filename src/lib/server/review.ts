import { db } from './supabase';
import type { SubmissionStatus } from './database.types';

/**
 * Submit a review decision.
 *
 * All of the dangerous logic lives in the `review_hackclub_submission`
 * Postgres function (see supabase/migrations/0004_hackclub_submissions.sql):
 * permission check, self-review check, terminal-state check, the review
 * write and the ledger credit all happen in ONE transaction.
 *
 * `reviewerId` comes from the server session. The client cannot influence who
 * the reviewer is, nor what role they hold — the function re-reads the role
 * from the database itself.
 */

export type ReviewOutcome = { ok: true; reviewId: string } | { ok: false; message: string };

export async function submitReview(params: {
	reviewId: string;
	reviewerId: string;
	status: SubmissionStatus;
	approvedHours: number | null;
	internalNotes: string | null;
	participantFeedback: string | null;
	submittedHours: number | null;
}): Promise<ReviewOutcome> {
	const { data, error } = await db().rpc('review_hackclub_submission', {
		p_review_id: params.reviewId,
		p_reviewer_id: params.reviewerId,
		p_status: params.status,
		p_approved_hours: params.approvedHours,
		p_internal_notes: params.internalNotes,
		p_participant_feedback: params.participantFeedback,
		p_submitted_hours: params.submittedHours
	});

	if (error) {
		// A retry or double-click races into the unique indexes
		// (submission_reviews_one_per_project / hour_transactions_one_credit_per_submission).
		if (error.code === '23505' || /already/i.test(error.message)) {
			return { ok: false, message: 'This review has already been decided.' };
		}
		if (error.code === '42501') {
			return { ok: false, message: error.message };
		}
		return { ok: false, message: 'Could not record that review. Try again.' };
	}

	return { ok: true, reviewId: data as unknown as string };
}
