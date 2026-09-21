import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireReviewer } from '$lib/server/guards';
import {
	getSubmissionForReview,
	listAttachments,
	listReviews,
	getBalance
} from '$lib/server/queries';
import { signedEvidenceUrl } from '$lib/server/storage';
import { fetchProjectTimes, formatHours } from '$lib/server/hackatime';
import { submitReview } from '$lib/server/review';
import { hours, oneOf, text, uuid, ValidationError } from '$lib/server/validate';
import type { ReviewDecision } from '$lib/server/database.types';

const DECISIONS = ['approved', 'changes_requested', 'rejected'] as const;

export const load: PageServerLoad = async ({ locals, params }) => {
	const reviewer = requireReviewer(locals);
	const submissionId = uuid(params.id, 'submission');

	const submission = await getSubmissionForReview(submissionId);
	const [attachments, reviews, balance] = await Promise.all([
		listAttachments(submissionId),
		listReviews(submissionId),
		submission.user_id ? getBalance(submission.user_id) : Promise.resolve(null)
	]);

	// Short-lived signed URLs; the bucket stays private.
	const evidence = await Promise.all(
		attachments.map(async (a) => ({
			id: a.id,
			filename: a.filename,
			contentType: a.content_type,
			url: await signedEvidenceUrl(a.storage_key)
		}))
	);

	// Hackatime time for the mapped project, as review evidence.
	let tracked: { name: string; time: string } | null = null;
	const hackatimeProject = submission.projects?.hackatime_project;
	if (hackatimeProject && submission.user_id) {
		const times = await fetchProjectTimes(submission.user_id);
		const match = times?.find((t) => t.name === hackatimeProject);
		if (match) tracked = { name: match.name, time: formatHours(match.totalSeconds) };
	}

	return {
		submission,
		evidence,
		reviews,
		balance,
		tracked,
		hackatimeProject: hackatimeProject ?? null,
		isOwnSubmission: submission.user_id === reviewer.id
	};
};

export const actions: Actions = {
	default: async ({ request, locals, params }) => {
		// Role comes from the session; the database re-checks it again inside
		// review_submission() before anything is written.
		const reviewer = requireReviewer(locals);
		const submissionId = uuid(params.id, 'submission');
		const form = await request.formData();

		try {
			const decision = oneOf<ReviewDecision>(form.get('decision'), DECISIONS, 'decision');
			const feedback = text(form.get('feedback'), 'Feedback', { max: 4000 });

			if (decision !== 'approved' && !feedback) {
				return fail(400, { message: 'Give the participant some feedback to act on.' });
			}

			const hoursApproved =
				decision === 'approved' ? hours(form.get('hours_approved'), 'Approved hours') : null;

			const result = await submitReview({
				submissionId,
				reviewerId: reviewer.id,
				decision,
				hoursApproved,
				feedback
			});

			if (!result.ok) return fail(409, { message: result.message });
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message, field: e.field });
			throw e;
		}

		redirect(303, '/admin/reviews');
	}
};
