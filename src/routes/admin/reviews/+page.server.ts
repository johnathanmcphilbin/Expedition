import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/guards';
import { db } from '$lib/server/supabase';
import {
	listAllHackClubSubmissions,
	listAllReviewsWithSubmissions,
	getOrCreateReview,
	getHackClubSubmission,
	getBalance,
	searchUsers,
	linkSubmissionToUser,
	reopenReview,
	listPriorApprovals
} from '$lib/server/queries';
import {
	syncHackClubSubmissions,
	writeReviewToAirtable,
	getJustifications,
	saveJustifications,
	JUSTIFICATION_FIELDS
} from '$lib/server/airtable';
import { fetchProjectTimes, formatHours } from '$lib/server/hackatime';
import { submitReview } from '$lib/server/review';
import { listProjectCheckpoints, unlockedCount } from '$lib/server/checkpoints';
import {
	listQueue,
	getQueued,
	screenshotUrl,
	updateQueuedFields,
	decideQueued,
	sendQueued,
	reopenQueued,
	purgeStalePersonalData,
	setQueuedHardware
} from '$lib/server/queue';
import { parseSubmissionFields, parseJustifications } from '$lib/server/submission-fields';
import { hours, text, uuid, oneOf, ValidationError } from '$lib/server/validate';
import type { SubmissionStatus } from '$lib/server/database.types';
import type { QueueItem } from '$lib/server/queries';

const FILTERS = ['hardware', 'pending', 'changes_requested', 'approved', 'rejected', 'all'] as const;
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

	purgeStalePersonalData().catch((e) => console.error('purgeStalePersonalData', e));

	const [submissions, reviews, queued, flagRows] = await Promise.all([
		listAllHackClubSubmissions(),
		listAllReviewsWithSubmissions(),
		listQueue(),
		db().from('review_flags').select('item_kind, item_key, reason, flagged_at')
	]);
	// "possible fraud" marks, by kind:key
	const flags = new Map(
		(flagRows.data ?? []).map((f) => [`${f.item_kind}:${f.item_key}`, { reason: f.reason, at: f.flagged_at }])
	);

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

	// One list for everything: submissions already in Hack Club's Airtable
	// ('hc') and ones still waiting in Expedition's own queue ('new'). A
	// queued one that's been sent shows up as its 'hc' row instead.
	type Item = {
		kind: 'hc' | 'new';
		key: string;
		status: SubmissionStatus;
		participant: string;
		project: string | null;
		submittedAt: string | null;
		matched: boolean;
		hardware: boolean;
		flag: { reason: string | null; at: string } | null;
		searchText: string;
	};
	// hardware is ticked on the submission form; a queued submission that's
	// since been sent keeps its flag via its Airtable record id. Anything
	// submitted before the checkbox existed counts as software.
	const queueIdByRecord = new Map(
		queued.filter((qr) => qr.airtable_record_id).map((qr) => [qr.airtable_record_id as string, qr.id])
	);
	const hardwareByRecord = new Map(
		queued.filter((qr) => qr.airtable_record_id).map((qr) => [qr.airtable_record_id as string, qr.hardware])
	);

	const items: Item[] = [
		...rows.map((r) => ({
			kind: 'hc' as const,
			key: r.submission.airtable_record_id,
			status: r.status,
			participant:
				[r.submission.first_name, r.submission.last_name].filter(Boolean).join(' ') ||
				r.submission.email ||
				r.submission.owner?.display_name ||
				'Unknown',
			project: r.review?.hackatime_project ?? r.submission.project_names_raw,
			submittedAt: r.submission.airtable_created_at,
			matched: !!r.submission.user_id,
			hardware: hardwareByRecord.get(r.submission.airtable_record_id) ?? false,
			// a flag set while it was still queued follows it once sent
			flag:
				flags.get(`hc:${r.submission.airtable_record_id}`) ??
				flags.get(`new:${queueIdByRecord.get(r.submission.airtable_record_id)}`) ??
				null,
			searchText: [r.submission.first_name, r.submission.last_name, r.submission.email, r.submission.github_username, r.submission.project_names_raw, r.review?.hackatime_project]
				.filter(Boolean)
				.join(' ')
				.toLowerCase()
		})),
		...queued
			.filter((qr) => qr.status !== 'sent')
			.map((qr) => ({
				kind: 'new' as const,
				key: qr.id,
				status: qr.status as SubmissionStatus,
				participant: `${qr.first_name} ${qr.last_name}`.trim() || qr.owner?.display_name || 'Unknown',
				project: qr.project_name,
				submittedAt: qr.created_at,
				matched: true,
				hardware: qr.hardware,
				flag: flags.get(`new:${qr.id}`) ?? null,
				searchText: [qr.first_name, qr.last_name, qr.email, qr.github_username, qr.project_name]
					.join(' ')
					.toLowerCase()
			}))
	].sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''));

	const isPending = (st: SubmissionStatus) => st === 'pending' || st === 'in_review';

	const trackParam = url.searchParams.get('track');
	// one queue by default; ?track=software|hardware still narrows it for old links
	const track = trackParam === 'hardware' || trackParam === 'software' ? trackParam : 'all';
	const inTrack = (i: Item) => track === 'all' || (track === 'hardware') === i.hardware;
	const trackCounts = {
		software: items.filter((i) => !i.hardware && isPending(i.status)).length,
		hardware: items.filter((i) => i.hardware && isPending(i.status)).length,
		all: items.filter((i) => isPending(i.status)).length
	};
	const trackItems = items.filter(inTrack);

	// hardware waiting for review has its own tab; Pending is software only
	const counts = {
		hardware: trackItems.filter((i) => i.hardware && isPending(i.status)).length,
		pending: trackItems.filter((i) => !i.hardware && isPending(i.status)).length,
		changes_requested: trackItems.filter((i) => i.status === 'changes_requested').length,
		approved: trackItems.filter((i) => i.status === 'approved').length,
		rejected: trackItems.filter((i) => i.status === 'rejected').length,
		all: trackItems.length
	};

	const filter = (url.searchParams.get('status') as Filter | null) ?? 'pending';
	const validFilter = FILTERS.includes(filter) ? filter : 'pending';
	const filtered =
		validFilter === 'all'
			? trackItems
			: validFilter === 'hardware'
				? trackItems.filter((i) => i.hardware && isPending(i.status))
				: validFilter === 'pending'
					? trackItems.filter((i) => !i.hardware && isPending(i.status))
					: trackItems.filter((i) => i.status === validFilter);

	const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
	const searched = q ? filtered.filter((i) => i.searchText.includes(q)) : filtered;

	const newId = url.searchParams.get('new');
	const hcId = url.searchParams.get('submission');
	const selectedItem =
		(newId && items.find((i) => i.kind === 'new' && i.key === newId)) ||
		(hcId && items.find((i) => i.kind === 'hc' && i.key === hcId)) ||
		searched[0] ||
		null;
	const selectedRow =
		selectedItem?.kind === 'hc' ? (rows.find((r) => r.submission.airtable_record_id === selectedItem.key) ?? null) : null;

	// ---- a queued ('new') submission: the editable, not-yet-sent form
	let queuedDetail = null;
	if (selectedItem?.kind === 'new') {
		const row = queued.find((qr) => qr.id === selectedItem.key)!;
		const [times, balance, shot] = await Promise.all([
			fetchProjectTimes(row.user_id),
			getBalance(row.user_id),
			screenshotUrl(row.screenshot_path)
		]);
		const projects = (times ?? []).map((t) => ({ name: t.name, tracked: formatHours(t.totalSeconds), seconds: t.totalSeconds }));
		const picked = row.hackatime_projects?.length ? row.hackatime_projects : [row.project_name];
		const matched = projects.filter((p) => picked.includes(p.name));
		const [checkpoints, priorApprovals] = await Promise.all([
			Promise.all(picked.map((n) => listProjectCheckpoints(row.user_id, n))).then((l) => l.flat()),
			listPriorApprovals(row.user_id, picked, row.airtable_record_id)
		]);
		queuedDetail = {
			row,
			picked,
			priorApprovals,
			justifications: {
				'Justification - Hackatime Project Name(s) + Date Range(s)': picked.join(', '),
				'Justification - Submitter Hackatime ID': row.hackatime_user_id,
				...Object.fromEntries(Object.entries(row.justifications ?? {}).filter(([, v]) => v !== null))
			} as Record<string, string | null>,
			screenshot: shot,
			projects,
			hackatimeUnavailable: times === null,
			checkpoints,
			checkpointsUnlocked: matched.reduce((sum, p) => sum + unlockedCount(p.seconds / 3600), 0),
			trackedHours: matched.length
				? Math.round((matched.reduce((sum, p) => sum + p.seconds, 0) / 3600) * 100) / 100
				: null,
			balance
		};
	}

	let detail: {
		submission: (typeof submissions)[number];
		review: QueueItem | null;
		hackatimeProjects: { name: string; tracked: string }[];
		suggestedProject: string | null;
		balance: Awaited<ReturnType<typeof getBalance>> | null;
		linkCandidates: Awaited<ReturnType<typeof searchUsers>>;
		checkpoints: Awaited<ReturnType<typeof listProjectCheckpoints>>;
		priorApprovals: Awaited<ReturnType<typeof listPriorApprovals>>;
		justifications: Record<string, string | null> | null;
		justificationsError: string | null;
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

		const cpProjects = selectedRow.review?.hackatime_projects?.length
			? selectedRow.review.hackatime_projects
			: [selectedRow.review?.hackatime_project ?? suggestedProject].filter((n): n is string => !!n);
		const checkpoints = selectedRow.submission.user_id
			? (await Promise.all(cpProjects.map((n) => listProjectCheckpoints(selectedRow.submission.user_id!, n)))).flat()
			: [];

		const priorApprovals = selectedRow.submission.user_id
			? await listPriorApprovals(selectedRow.submission.user_id, cpProjects, selectedRow.submission.airtable_record_id)
			: [];

		let justifications: Record<string, string | null> | null = null;
		let justificationsError: string | null = null;
		try {
			justifications = await getJustifications(selectedRow.submission.airtable_record_id);
		} catch (e) {
			justificationsError = e instanceof Error ? e.message : "Couldn't read it from Airtable.";
		}

		detail = {
			submission: selectedRow.submission,
			review: selectedRow.review,
			justifications,
			justificationsError,
			checkpoints,
			priorApprovals,
			hackatimeProjects,
			suggestedProject,
			balance,
			linkCandidates
		};
	}

	return {
		queue: searched.map(({ searchText: _s, ...i }) => i),
		selected: selectedItem ? { kind: selectedItem.kind, key: selectedItem.key } : null,
		selectedFlag: selectedItem ? (flags.get(`${selectedItem.kind}:${selectedItem.key}`) ?? null) : null,
		track,
		trackCounts,
		justificationFields: JUSTIFICATION_FIELDS.map((f, i) => ({ input: `just_${i}`, name: f.name, label: f.label, rows: f.rows })),
		queuedDetail,
		filter: validFilter,
		counts,
		search: q,
		linkQuery: url.searchParams.get('link_q') ?? '',
		detail,
		syncError
	};
};

export const actions: Actions = {
	/** Edit Hack Club's justification fields on a submission that's already in their Airtable. */
	saveJustification: async ({ request, locals }) => {
		requireAdmin(locals);
		const form = await request.formData();
		try {
			const recordId = text(form.get('airtable_record_id'), 'Submission', { max: 200, required: true })!;
			if (!/^rec[A-Za-z0-9]{10,20}$/.test(recordId)) return fail(400, { justMessage: 'Invalid submission.' });
			await saveJustifications(recordId, parseJustifications(form));
			return { justSaved: true };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { justMessage: e.message });
			console.error('saveJustification', e);
			return fail(502, { justMessage: "Airtable didn't accept that. Nothing changed, so you can try again." });
		}
	},

	/** Queued (not yet sent) submission: rejected / needs changes -> back to waiting. */
	reopenNew: async ({ request, locals }) => {
		requireAdmin(locals);
		const form = await request.formData();
		let id: string;
		try {
			id = uuid(form.get('id')?.toString(), 'submission');
			await reopenQueued(id);
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message });
			throw e;
		}
		redirect(303, `/admin/reviews?status=pending&new=${id}`);
	},

	/**
	 * Queued (not yet sent) submission. One form, four buttons: save edits and
	 * leave it waiting, ask for changes, reject, or approve — which sends it to
	 * Hack Club's Airtable and credits the hours.
	 */
	/** Mark a submission as possible fraud (or clear the mark). */
	flag: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const form = await request.formData();
		try {
			const kind = oneOf(form.get('kind'), ['hc', 'new'] as const, 'Kind');
			const key = text(form.get('key'), 'Submission', { max: 64, required: true })!;
			if (form.get('on') === 'yes') {
				const { error } = await db()
					.from('review_flags')
					.upsert(
						{
							item_kind: kind,
							item_key: key,
							reason: text(form.get('reason'), 'Reason', { max: 500 }),
							flagged_by: admin.id,
							flagged_at: new Date().toISOString()
						},
						{ onConflict: 'item_kind,item_key' }
					);
				if (error) throw new Error(error.message);
			} else {
				const { error } = await db().from('review_flags').delete().eq('item_kind', kind).eq('item_key', key);
				if (error) throw new Error(error.message);
			}
			return { flagged: form.get('on') === 'yes' };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message });
			throw e;
		}
	},

	/** Just the Hardware tick, saved on its own as soon as it changes. */
	setHardware: async ({ request, locals }) => {
		requireAdmin(locals);
		const form = await request.formData();
		try {
			const id = uuid(form.get('id')?.toString(), 'submission');
			await setQueuedHardware(id, form.get('hardware') === 'yes');
			return { hardwareSaved: true };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message });
			throw e;
		}
	},

	saveNew: async ({ request, locals, url }) => {
		const reviewer = requireAdmin(locals);
		const form = await request.formData();

		let id: string;
		try {
			id = uuid(form.get('id')?.toString(), 'submission');
			const row = await getQueued(id);
			if (!row) return fail(404, { message: 'That submission no longer exists.' });
			if (row.status === 'sent') return fail(409, { message: 'This one has already been sent to Hack Club.' });

			const decision = oneOf(
				form.get('decision'),
				['draft', 'approve', 'changes_requested', 'rejected'] as const,
				'Decision'
			);
			const fields = parseSubmissionFields(form);

			const times = await fetchProjectTimes(row.user_id);
			const missing = times ? fields.hackatime_projects.filter((n) => !times.some((t) => t.name === n)) : [];
			if (missing.length) {
				throw new ValidationError(`"${missing[0]}" isn't in their Hackatime`, 'project');
			}

			const approvedRaw = form.get('approved_hours');
			const approvedHours =
				typeof approvedRaw === 'string' && approvedRaw.trim() ? hours(approvedRaw, 'Approved hours') : null;
			const internalNotes = text(form.get('internal_notes'), 'Private notes', { max: 4000 });
			const feedback = text(form.get('participant_feedback'), 'Feedback', { max: 4000 });

			if (decision === 'approve' && approvedHours === null) {
				return fail(400, { message: 'Set how many hours to approve before sending it.' });
			}
			if ((decision === 'changes_requested' || decision === 'rejected') && !feedback) {
				return fail(400, { message: 'Give them some feedback to act on.' });
			}

			await updateQueuedFields(id, fields, parseJustifications(form));

			if (decision === 'approve') {
				const matched = (times ?? []).filter((t) => fields.hackatime_projects.includes(t.name));
				const result = await sendQueued({
					id,
					reviewer,
					approvedHours: approvedHours!,
					internalNotes,
					participantFeedback: feedback,
					submittedHours: matched.length ? matched.reduce((sum, t) => sum + t.totalSeconds, 0) / 3600 : null
				});
				if (!result.ok) return fail(502, { message: result.message });
			} else {
				await decideQueued(
					id,
					reviewer.id,
					decision === 'draft' ? 'pending' : decision,
					approvedHours,
					internalNotes,
					feedback
				);
			}

			if (decision === 'draft') return { saved: true };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message, field: e.field });
			throw e;
		}

		// decided: move on to the next one in the same tab
		const qs = new URLSearchParams();
		if (url.searchParams.get('status')) qs.set('status', url.searchParams.get('status')!);
		if (url.searchParams.get('q')) qs.set('q', url.searchParams.get('q')!);
		if (url.searchParams.get('track')) qs.set('track', url.searchParams.get('track')!);
		redirect(303, `/admin/reviews${qs.toString() ? `?${qs}` : ''}`);
	},

	/** A rejected review back into the pending queue. Approved stays final. */
	reopen: async ({ request, locals, url }) => {
		const admin = requireAdmin(locals);
		const form = await request.formData();
		let submission = '';
		try {
			const reviewId = uuid(form.get('review_id')?.toString(), 'review');
			submission = text(form.get('airtable_record_id'), 'Submission', { max: 200, required: true })!;
			const result = await reopenReview(reviewId, admin.id);
			if (!result.ok) return fail(409, { message: result.message });
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message });
			throw e;
		}
		redirect(303, `/admin/reviews?status=pending&submission=${encodeURIComponent(submission)}${url.searchParams.get('q') ? `&q=${encodeURIComponent(url.searchParams.get('q')!)}` : ''}`);
	},

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
		if (url.searchParams.get('track')) qs.set('track', url.searchParams.get('track')!);
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
						hackatime_projects: review.hackatime_projects,
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
					submission
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
		if (url.searchParams.get('track')) qs.set('track', url.searchParams.get('track')!);
		redirect(303, `/admin/reviews${qs.toString() ? `?${qs}` : ''}`);
	}
};

