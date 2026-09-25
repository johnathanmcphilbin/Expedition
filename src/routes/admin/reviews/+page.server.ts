import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/guards';
import {
	listAllHackClubSubmissions,
	listAllReviewsWithSubmissions,
	getOrCreateReview,
	getHackClubSubmission,
	getBalance,
	searchUsers,
	linkSubmissionToUser
} from '$lib/server/queries';
import { syncHackClubSubmissions, writeReviewToAirtable } from '$lib/server/airtable';
import { fetchProjectTimes, formatHours } from '$lib/server/hackatime';
import { submitReview } from '$lib/server/review';
import { hours, text, uuid, oneOf, ValidationError } from '$lib/server/validate';
import type { SubmissionStatus } from '$lib/server/database.types';
import type { QueueItem } from '$lib/server/queries';

const FILTERS = ['pending', 'changes_requested', 'approved', 'rejected', 'all'] as const;
type Filter = (typeof FILTERS)[number];

const STATUSES = ['pending', 'in_review', 'changes_requested', 'approved', 'rejected'] as const;

export const load: PageServerLoad = async ({ locals, url }) => {
	requireAdmin(locals);

	// Pull fresh from Hack Club every time the queue is opened. A failure here
	// (bad/missing AIRTABLE_API_KEY, Airtable unreachable) is surfaced as a
	// clear banner, not a crash and not a silently empty queue.
	let syncError: string | null = null;
	try {
		await syncHackClubSubmissions();
	} catch (e) {
		syncError = e instanceof Error ? e.message : 'Could not sync Hack Club submissions.';
	}

	const [submissions, reviews] = await Promise.all([
		listAllHackClubSubmissions(),
		listAllReviewsWithSubmissions()
	]);

	const reviewsBySubmission = new Map<string, QueueItem[]>();
	for (const r of reviews) {
		const list = reviewsBySubmission.get(r.airtable_record_id) ?? [];
		list.push(r);
		reviewsBySubmission.set(r.airtable_record_id, list);
	}

	// One queue row per Hack Club submission. A submission with no review yet
	// shows as a synthetic "pending" entry so it appears the moment it's
	// synced — opening it is what actually creates the review row.
	type Row = {
		submission: (typeof submissions)[number];
		review: QueueItem | null;
		status: SubmissionStatus;
	};
	const rows: Row[] = submissions.map((s) => {
		// a submission can in principle carry more than one review (one per
		// project); the queue shows whichever is least settled
		const rs = reviewsBySubmission.get(s.airtable_record_id) ?? [];
		const active =
			rs.find((r) => !['approved', 'rejected'].includes(r.status)) ?? rs[0] ?? null;
		return { submission: s, review: active, status: active?.status ?? 'pending' };
	});

	const counts = {
		pending: rows.filter((r) => r.status === 'pending' || r.status === 'in_review').length,
		changes_requested: rows.filter((r) => r.status === 'changes_requested').length,
		approved: rows.filter((r) => r.status === 'approved').length,
		rejected: rows.filter((r) => r.status === 'rejected').length,
		all: rows.length
	};

	const filter = (url.searchParams.get('status') as Filter | null) ?? 'pending';
	const validFilter = FILTERS.includes(filter) ? filter : 'pending';
	const filtered =
		validFilter === 'all'
			? rows
			: validFilter === 'pending'
				? rows.filter((r) => r.status === 'pending' || r.status === 'in_review')
				: rows.filter((r) => r.status === validFilter);

	const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
	const searched = q
		? filtered.filter((r) => {
				const s = r.submission;
				const hay = [
					s.first_name,
					s.last_name,
					s.email,
					s.github_username,
					s.project_names_raw,
					r.review?.hackatime_project
				]
					.filter(Boolean)
					.join(' ')
					.toLowerCase();
				return hay.includes(q);
			})
		: filtered;

	const selectedId = url.searchParams.get('submission');
	const selectedRow = selectedId
		? (rows.find((r) => r.submission.airtable_record_id === selectedId) ?? searched[0] ?? null)
		: (searched[0] ?? null);

	let detail: {
		submission: (typeof submissions)[number];
		review: QueueItem | null;
		hackatimeProjects: { name: string; tracked: string }[];
		suggestedProject: string | null;
		balance: Awaited<ReturnType<typeof getBalance>> | null;
		linkCandidates: Awaited<ReturnType<typeof searchUsers>>;
	} | null = null;

	if (selectedRow) {
		let hackatimeProjects: { name: string; tracked: string }[] = [];
		let balance = null;
		if (selectedRow.submission.user_id) {
			const [times, bal] = await Promise.all([
				fetchProjectTimes(selectedRow.submission.user_id),
				getBalance(selectedRow.submission.user_id)
			]);
			hackatimeProjects = (times ?? []).map((t) => ({
				name: t.name,
				tracked: formatHours(t.totalSeconds)
			}));
			balance = bal;
		}

		// best-effort guess at which live Hackatime project this submission
		// means, from Hack Club's free-text field — the admin confirms it
		const raw = (selectedRow.submission.project_names_raw ?? '').toLowerCase();
		const suggestedProject =
			selectedRow.review?.hackatime_project ??
			hackatimeProjects.find((p) => raw.includes(p.name.toLowerCase()))?.name ??
			null;

		const linkQuery = url.searchParams.get('link_q') ?? '';
		const linkCandidates = !selectedRow.submission.user_id && linkQuery ? await searchUsers(linkQuery) : [];

		detail = {
			submission: selectedRow.submission,
			review: selectedRow.review,
			hackatimeProjects,
			suggestedProject,
			balance,
			linkCandidates
		};
	}

	return {
		queue: searched.map((r) => ({
			airtableRecordId: r.submission.airtable_record_id,
			participant:
				[r.submission.first_name, r.submission.last_name].filter(Boolean).join(' ') ||
				r.submission.email ||
				r.submission.owner?.display_name ||
				'Unknown',
			owner: r.submission.owner ?? null,
			status: r.status,
			project: r.review?.hackatime_project ?? r.submission.project_names_raw,
			submittedAt: r.submission.airtable_created_at,
			matched: !!r.submission.user_id
		})),
		filter: validFilter,
		counts,
		search: q,
		linkQuery: url.searchParams.get('link_q') ?? '',
		detail,
		syncError
	};
};

export const actions: Actions = {
	/**
	 * Manually attach a submission to an Expedition account when Hack Club's
	 * form never captured (or never matched) the submitter's Hackatime ID.
	 * Stays attached across future resyncs — see `syncHackClubSubmissions`.
	 */
	link: async ({ request, locals }) => {
		requireAdmin(locals);
		const form = await request.formData();
		try {
			const airtableRecordId = text(form.get('airtable_record_id'), 'Submission', {
				max: 200,
				required: true
			})!;
			const userId = uuid(form.get('user_id')?.toString(), 'account');
			await linkSubmissionToUser(airtableRecordId, userId);
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message, field: e.field });
			throw e;
		}

		const url = new URL(request.url);
		const qs = new URLSearchParams();
		if (url.searchParams.get('status')) qs.set('status', url.searchParams.get('status')!);
		if (url.searchParams.get('q')) qs.set('q', url.searchParams.get('q')!);
		qs.set('submission', form.get('airtable_record_id')!.toString());
		redirect(303, `/admin/reviews?${qs}`);
	},

	/**
	 * One action for every button (Save Review / Approve / Needs Changes /
	 * Reject) — they differ only in which `status` they submit. On a final
	 * decision (anything but pending), this redirects to the bare filtered
	 * queue URL rather than back to this item, so the next pending submission
	 * is selected automatically.
	 */
	save: async ({ request, locals }) => {
		const reviewer = requireAdmin(locals);
		const form = await request.formData();

		try {
			const airtableRecordId = text(form.get('airtable_record_id'), 'Submission', {
				max: 200,
				required: true
			})!;
			const hackatimeProject = text(form.get('hackatime_project'), 'Project', {
				max: 200,
				required: true
			})!;
			const status = oneOf<SubmissionStatus>(form.get('status'), STATUSES, 'Status');
			const approvedHours =
				form.get('approved_hours') && String(form.get('approved_hours')).trim() !== ''
					? hours(form.get('approved_hours'), 'Approved hours')
					: null;
			const internalNotes = text(form.get('internal_notes'), 'Internal notes', { max: 4000 });
			const participantFeedback = text(form.get('participant_feedback'), 'Feedback', {
				max: 4000
			});
			const userId = uuid(form.get('user_id')?.toString(), 'participant');

			if (status !== 'pending' && status !== 'in_review' && !participantFeedback) {
				return fail(400, { message: 'Give the participant some feedback to act on.' });
			}

			// live snapshot of tracked hours for this project, refreshed on every save
			const times = await fetchProjectTimes(userId);
			const match = times?.find((t) => t.name === hackatimeProject);
			const submittedHours = match ? match.totalSeconds / 3600 : null;

			const review = await getOrCreateReview(
				airtableRecordId,
				userId,
				hackatimeProject,
				submittedHours
			);

			const result = await submitReview({
				reviewId: review.id,
				reviewerId: reviewer.id,
				status,
				approvedHours,
				internalNotes,
				participantFeedback,
				submittedHours
			});

			if (!result.ok) return fail(409, { message: result.message });

			// Write to Airtable server-side, after the ledger transaction is
			// committed — never before, and never with the token anywhere near
			// the client. Built from what's already in scope rather than
			// re-reading the row back — everything needed is right here.
			try {
				const submission = await getHackClubSubmission(airtableRecordId);
				await writeReviewToAirtable(
					{
						id: review.id,
						airtable_record_id: airtableRecordId,
						user_id: userId,
						hackatime_project: hackatimeProject,
						submitted_hours: submittedHours ?? review.submitted_hours,
						// matches review_hackclub_submission()'s own
						// coalesce(p_approved_hours, approved_hours): a draft value
						// persists even while still pending, not only on approval
						approved_hours: approvedHours ?? review.approved_hours,
						status,
						internal_notes: internalNotes,
						participant_feedback: participantFeedback,
						reviewer_id: status !== 'pending' ? reviewer.id : review.reviewer_id,
						reviewed_at: status !== 'pending' ? new Date().toISOString() : review.reviewed_at,
						created_at: review.created_at,
						updated_at: new Date().toISOString()
					},
					submission,
					reviewer
				);
			} catch (e) {
				// The review is already saved and the hours (if any) already
				// credited — an Airtable write failure here is surfaced but
				// must not roll back or block that.
				return fail(502, {
					message:
						'Saved, but could not write to Airtable: ' +
						(e instanceof Error ? e.message : 'unknown error')
				});
			}
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message, field: e.field });
			throw e;
		}

		const url = new URL(request.url);
		const qs = new URLSearchParams();
		if (url.searchParams.get('status')) qs.set('status', url.searchParams.get('status')!);
		if (url.searchParams.get('q')) qs.set('q', url.searchParams.get('q')!);
		redirect(303, `/admin/reviews${qs.toString() ? `?${qs}` : ''}`);
	}
};

