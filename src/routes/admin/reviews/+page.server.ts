import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin, requireReviewer, isReviewerOnly, reviewerName } from '$lib/server/guards';
import { lapsesFor, LAPSE_FIELD, type Lapse } from '$lib/server/lapse';
import { payForReview, reviewEarnings, REVIEW_PAY_USD } from '$lib/server/payouts';
import type { UserRow, SubmissionReviewRow, QueuedSubmissionRow } from '$lib/server/database.types';
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
	JUSTIFICATION_FIELDS,
	AIRTABLE_GONE,
	foldOverrideJustification
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
	setQueuedHardware,
	hackatimeNames
} from '$lib/server/queue';
import { parseSubmissionFields, parseJustifications } from '$lib/server/submission-fields';
import { hours, text, uuid, oneOf, ValidationError } from '$lib/server/validate';
import type { SubmissionStatus } from '$lib/server/database.types';
import type { QueueItem } from '$lib/server/queries';

const FILTERS = ['hardware', 'pending', 'changes_requested', 'approved', 'rejected', 'all'] as const;
type Filter = (typeof FILTERS)[number];

const STATUSES = ['pending', 'in_review', 'changes_requested', 'approved', 'rejected'] as const;

export const load: PageServerLoad = async ({ locals, url }) => {
	const viewer = requireReviewer(locals);

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
		userId: string | null;
		/** deleted from Hack Club's Airtable: nothing left to review */
		gone: boolean;
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

	// A queued submission whose approval got as far as creating its Airtable
	// row but didn't finish is still the queued item: hide the half-made
	// Airtable copy, or it shows up twice with an empty review.
	const halfSent = new Set(
		queued.filter((qr) => qr.airtable_record_id && qr.status !== 'sent').map((qr) => qr.airtable_record_id as string)
	);

	const items: Item[] = [
		...rows.filter((r) => !halfSent.has(r.submission.airtable_record_id)).map((r) => ({
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
			userId: r.submission.user_id,
			hardware: hardwareByRecord.get(r.submission.airtable_record_id) ?? false,
			gone: r.submission.airtable_status === AIRTABLE_GONE,
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
				userId: qr.user_id,
				gone: false,
				hardware: qr.hardware,
				flag: flags.get(`new:${qr.id}`) ?? null,
				searchText: [qr.first_name, qr.last_name, qr.email, qr.github_username, qr.project_name]
					.join(' ')
					.toLowerCase()
			}))
	]
		// nobody sees (or can open) their own submissions in the queue
		.filter((i) => i.userId !== viewer.id)
		.sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''));

	const isPending = (st: SubmissionStatus) => st === 'pending' || st === 'in_review';
	// waiting for a decision, and still there to decide on
	const waiting = (i: Item) => isPending(i.status) && !i.gone;

	const trackParam = url.searchParams.get('track');
	// one queue by default; ?track=software|hardware still narrows it for old links
	const track = trackParam === 'hardware' || trackParam === 'software' ? trackParam : 'all';
	const inTrack = (i: Item) => track === 'all' || (track === 'hardware') === i.hardware;
	const trackCounts = {
		software: items.filter((i) => !i.hardware && waiting(i)).length,
		hardware: items.filter((i) => i.hardware && waiting(i)).length,
		all: items.filter((i) => waiting(i)).length
	};
	const trackItems = items.filter(inTrack);

	// hardware waiting for review has its own tab; Pending is software only
	const counts = {
		hardware: trackItems.filter((i) => i.hardware && waiting(i)).length,
		pending: trackItems.filter((i) => !i.hardware && waiting(i)).length,
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
				? trackItems.filter((i) => i.hardware && waiting(i))
				: validFilter === 'pending'
					? trackItems.filter((i) => !i.hardware && waiting(i))
					: trackItems.filter((i) => i.status === validFilter);

	// waiting tabs go oldest first, so whoever submitted first is reviewed first
	const ordered = validFilter === 'pending' || validFilter === 'hardware' ? [...filtered].reverse() : filtered;

	const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
	const searched = q ? ordered.filter((i) => i.searchText.includes(q)) : ordered;

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
		const picked = hackatimeNames(row);
		const matched = projects.filter((p) => picked.includes(p.name));
		const [checkpoints, priorApprovals, history] = await Promise.all([
			Promise.all(picked.map((n) => listProjectCheckpoints(row.user_id, n))).then((l) => l.flat()),
			listPriorApprovals(row.user_id, picked, row.airtable_record_id),
			reviewHistory(row.user_id, picked.length ? picked : [row.project_name], { queueId: row.id, recordId: row.airtable_record_id })
		]);
		const lapses = withOwnerCheck(await lapsesFor(row.justifications?.[LAPSE_FIELD] ?? null), row.hackatime_user_id);
		queuedDetail = {
			// reviewers never receive addresses; admins see and edit them
			row: viewer.role === 'admin' ? row : { ...row, ...HIDDEN_ADDRESS },
			picked,
			lapses,
			priorApprovals,
			history,
			justifications: {
				'Justification - Hackatime Project Name(s) + Date Range(s)': picked.length
					? picked.join(', ')
					: `None: hardware project "${row.project_name}", hours from its JOURNAL.md`,
				'Justification - Submitter Hackatime ID': row.hackatime_user_id,
				...foldOverrideJustification(
					Object.fromEntries(Object.entries(row.justifications ?? {}).filter(([, v]) => v !== null))
				)
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
		lapses: ReturnType<typeof withOwnerCheck>;
		submission: (typeof submissions)[number];
		gone: boolean;
		review: QueueItem | null;
		hackatimeProjects: { name: string; tracked: string }[];
		suggestedProject: string | null;
		balance: Awaited<ReturnType<typeof getBalance>> | null;
		linkCandidates: Awaited<ReturnType<typeof searchUsers>>;
		checkpoints: Awaited<ReturnType<typeof listProjectCheckpoints>>;
		priorApprovals: Awaited<ReturnType<typeof listPriorApprovals>>;
		history: Awaited<ReturnType<typeof reviewHistory>>;
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
		const history = selectedRow.submission.user_id
			? await reviewHistory(selectedRow.submission.user_id, cpProjects, { recordId: selectedRow.submission.airtable_record_id })
			: [];

		let justifications: Record<string, string | null> | null = null;
		let justificationsError: string | null = null;
		try {
			if (selectedRow.submission.airtable_status === AIRTABLE_GONE) {
				justificationsError = "This submission isn't in Hack Club's Airtable any more (it was deleted there).";
			} else {
				justifications = await getJustifications(selectedRow.submission.airtable_record_id);
			}
		} catch (e) {
			justificationsError = e instanceof Error ? e.message : "Couldn't read it from Airtable.";
		}

		const lapses = withOwnerCheck(await lapsesFor(justifications?.[LAPSE_FIELD] ?? null), selectedRow.submission.hackatime_user_id);
		detail = {
			lapses,
			submission: selectedRow.submission,
			gone: selectedRow.submission.airtable_status === AIRTABLE_GONE,
			review: selectedRow.review,
			justifications,
			justificationsError,
			checkpoints,
			priorApprovals,
			history,
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
		// input names keep their position in the full list; hidden fields just aren't shown
		justificationFields: JUSTIFICATION_FIELDS.map((f, i) => ({ input: `just_${i}`, name: f.name, label: f.label, rows: f.rows, hidden: 'hidden' in f && f.hidden }))
			.filter((f) => !f.hidden)
			.map(({ hidden: _h, ...f }) => f),
		queuedDetail,
		isAdmin: viewer.role === 'admin',
		airtableError: url.searchParams.get('airtable_error'),
		reviewerName: reviewerName(viewer),
		earnings: isReviewerOnly(viewer) ? { ...(await reviewEarnings(viewer.id)), per: REVIEW_PAY_USD } : null,
		filter: validFilter,
		counts,
		search: q,
		linkQuery: url.searchParams.get('link_q') ?? '',
		detail,
		syncError
	};
};

/**
 * Every earlier decision on this person's same project(s), from both review
 * paths, newest first: so a reviewer sees what was asked last time and by whom.
 */
async function reviewHistory(userId: string, names: string[], exclude: { queueId?: string; recordId?: string | null }) {
	const wanted = new Set(names.map((n) => n.toLowerCase()));
	const overlaps = (list: string[]) => list.some((n) => wanted.has(n.toLowerCase()));
	const [queue, reviews] = await Promise.all([
		db()
			.from('submission_queue')
			.select('id, project_name, hackatime_projects, hardware, status, approved_hours, participant_feedback, reviewer_id, reviewed_at, created_at, airtable_record_id')
			.eq('user_id', userId),
		db()
			.from('submission_reviews')
			.select('airtable_record_id, hackatime_project, hackatime_projects, status, approved_hours, participant_feedback, reviewer_id, reviewed_at, created_at')
			.eq('user_id', userId)
	]);
	const queueRows = (queue.data ?? []).filter(
		(r) => r.id !== exclude.queueId && r.status !== 'pending' && overlaps(hackatimeNames(r as QueuedSubmissionRow).length ? hackatimeNames(r as QueuedSubmissionRow) : [r.project_name])
	);
	const sentRecords = new Set((queue.data ?? []).map((r) => r.airtable_record_id).filter(Boolean));
	const reviewRows = (reviews.data ?? []).filter(
		(r) =>
			r.airtable_record_id !== exclude.recordId &&
			!sentRecords.has(r.airtable_record_id) &&
			r.status !== 'pending' &&
			r.status !== 'in_review' &&
			overlaps(r.hackatime_projects?.length ? r.hackatime_projects : [r.hackatime_project])
	);
	const reviewerIds = [...new Set([...queueRows, ...reviewRows].map((r) => r.reviewer_id).filter((x): x is string => !!x))];
	const { data: who } = reviewerIds.length ? await db().from('users').select('*').in('id', reviewerIds) : { data: [] };
	const nameOf = new Map(((who ?? []) as UserRow[]).map((u) => [u.id, reviewerName(u)]));
	return [
		...queueRows.map((r) => ({
			at: r.reviewed_at ?? r.created_at,
			project: r.project_name,
			status: r.status === 'sent' ? 'approved' : r.status,
			hours: r.approved_hours === null ? null : Number(r.approved_hours),
			feedback: r.participant_feedback,
			reviewer: r.reviewer_id ? (nameOf.get(r.reviewer_id) ?? 'Former reviewer') : null
		})),
		...reviewRows.map((r) => ({
			at: r.reviewed_at ?? r.created_at,
			project: r.hackatime_projects?.length ? r.hackatime_projects.join(' + ') : r.hackatime_project,
			status: r.status as string,
			hours: r.approved_hours === null ? null : Number(r.approved_hours),
			feedback: r.participant_feedback,
			reviewer: r.reviewer_id ? (nameOf.get(r.reviewer_id) ?? 'Former reviewer') : null
		}))
	].sort((a, b) => b.at.localeCompare(a.at));
}

/** Mark timelapses recorded by a different Hackatime account than the submitter's. */
function withOwnerCheck(lapses: Lapse[], submitterHackatimeId: string | null) {
	return lapses.map((l) => ({
		...l,
		someoneElse: l.ok && !!l.ownerHackatimeId && !!submitterHackatimeId && l.ownerHackatimeId !== submitterHackatimeId
	}));
}

const ADDRESS_FIELDS = ['address_line1', 'address_line2', 'city', 'state', 'zip', 'country'] as const;
const HIDDEN_ADDRESS = Object.fromEntries(ADDRESS_FIELDS.map((f) => [f, null])) as Record<(typeof ADDRESS_FIELDS)[number], null>;

/**
 * Reviewers' forms have no address fields (they never see them), so the
 * stored address is filled back in before parsing: it still reaches Hack
 * Club, and a reviewer can't change it.
 */
function keepStoredAddress(form: FormData, reviewer: UserRow, row: QueuedSubmissionRow) {
	if (reviewer.role === 'admin') return;
	for (const f of ADDRESS_FIELDS) form.set(f, row[f] ?? '');
}

/** "[Reviewed by Shadow]" at the top of private notes, once, for non-admin reviewers. */
function shadowNotes(reviewer: UserRow, notes: string | null): string | null {
	if (!isReviewerOnly(reviewer)) return notes;
	const tag = `[Reviewed by ${reviewerName(reviewer)}]`;
	if (notes?.includes(tag)) return notes;
	return notes ? `${tag}\n${notes}` : tag;
}

/** Nobody reviews their own project. */
async function ownsRecord(userId: string, recordId: string): Promise<boolean> {
	const { data } = await db().from('hackclub_submissions').select('user_id').eq('airtable_record_id', recordId).maybeSingle();
	return data?.user_id === userId;
}

export const actions: Actions = {
	/** Edit Hack Club's justification fields on a submission that's already in their Airtable. */
	saveJustification: async ({ request, locals }) => {
		const reviewer = requireReviewer(locals);
		const form = await request.formData();
		try {
			const recordId = text(form.get('airtable_record_id'), 'Submission', { max: 200, required: true })!;
			if (!/^rec[A-Za-z0-9]{10,20}$/.test(recordId)) return fail(400, { justMessage: 'Invalid submission.' });
			if (await ownsRecord(reviewer.id, recordId)) return fail(403, { justMessage: "You can't review your own project." });
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
	/**
	 * Saves whatever's been typed into a review as you go, without deciding
	 * anything, so it's there when anyone (you, or another reviewer) opens it
	 * later. Never changes the status; a half-typed field that doesn't parse
	 * yet is just left out until it does.
	 */
	autosave: async ({ request, locals }) => {
		const reviewer = requireReviewer(locals);
		const form = await request.formData();
		const hoursRaw = String(form.get('approved_hours') ?? '').trim();
		let approvedHours: number | null = null;
		if (hoursRaw) {
			try {
				approvedHours = hours(hoursRaw, 'Approved hours');
			} catch {
				approvedHours = null;
			}
		}
		const notes = text(form.get('internal_notes'), 'Notes', { max: 4000 });
		const feedback = text(form.get('participant_feedback'), 'Feedback', { max: 4000 });
		const kind = form.get('kind');

		if (kind === 'new') {
			let id: string;
			try {
				id = uuid(form.get('id')?.toString(), 'submission');
			} catch {
				return fail(400, { autosave: 'Invalid submission' });
			}
			const row = await getQueued(id);
			if (!row || row.status === 'sent') return fail(409, { autosave: 'Already sent' });
			if (row.user_id === reviewer.id) return fail(403, { autosave: "You can't review your own project" });
			keepStoredAddress(form, reviewer, row);
			let fields: ReturnType<typeof parseSubmissionFields> | null = null;
			try {
				fields = parseSubmissionFields(form);
			} catch {
				fields = null; // mid-edit; the review parts still save
			}
			const { error } = await db()
				.from('submission_queue')
				.update({
					...(fields ?? {}),
					approved_hours: approvedHours,
					internal_notes: notes,
					participant_feedback: feedback,
					justifications: parseJustifications(form)
				})
				.eq('id', id)
				.neq('status', 'sent');
			if (error) return fail(500, { autosave: error.message });
			return { autosaved: new Date().toISOString() };
		}

		if (kind === 'hc') {
			const recordId = String(form.get('airtable_record_id') ?? '');
			if (!/^rec[A-Za-z0-9]{10,20}$/.test(recordId)) return fail(400, { autosave: 'Invalid submission' });
			const linked = await getHackClubSubmission(recordId);
			if (!linked?.user_id) return fail(400, { autosave: 'Link it to an account first' });
			if (linked.airtable_status === AIRTABLE_GONE) return fail(409, { autosave: 'Gone from Airtable' });
			if (linked.user_id === reviewer.id) return fail(403, { autosave: "You can't review your own project" });
			const project = String(form.get('hackatime_project') ?? '').trim();
			const { data: existing } = await db()
				.from('submission_reviews')
				.select('id, status')
				.eq('airtable_record_id', recordId)
				.order('created_at', { ascending: false })
				.limit(1)
				.maybeSingle();
			let reviewId = existing?.id;
			if (!reviewId) {
				if (!project) return fail(400, { autosave: 'Pick the Hackatime project first' });
				reviewId = (await getOrCreateReview(recordId, linked.user_id, project, null)).id;
			} else if (existing && existing.status !== 'pending' && existing.status !== 'in_review') {
				return fail(409, { autosave: 'Already decided' });
			}
			const { error } = await db()
				.from('submission_reviews')
				.update({
					approved_hours: approvedHours,
					internal_notes: notes,
					participant_feedback: feedback,
					...(project ? { hackatime_project: project } : {})
				})
				.eq('id', reviewId)
				.in('status', ['pending', 'in_review']);
			if (error) return fail(500, { autosave: error.message });
			return { autosaved: new Date().toISOString() };
		}
		return fail(400, { autosave: 'Unknown submission' });
	},

	/** Write an approved review's hours and feedback to Hack Club's Airtable again. */
	resendAirtable: async ({ request, locals }) => {
		requireReviewer(locals);
		const form = await request.formData();
		const recordId = String(form.get('airtable_record_id') ?? '');
		if (!/^rec[A-Za-z0-9]{10,20}$/.test(recordId)) return fail(400, { airtableResend: 'Invalid submission.' });
		const submission = await getHackClubSubmission(recordId);
		if (!submission) return fail(404, { airtableResend: 'Submission not found.' });
		const { data: review } = await db()
			.from('submission_reviews')
			.select('*')
			.eq('airtable_record_id', recordId)
			.order('updated_at', { ascending: false })
			.limit(1)
			.maybeSingle();
		if (!review) return fail(404, { airtableResend: "There's no review to send yet." });
		let reviewedBy: string | null = null;
		if (review.reviewer_id) {
			const { data: who } = await db().from('users').select('*').eq('id', review.reviewer_id).maybeSingle();
			if (who && isReviewerOnly(who as UserRow)) reviewedBy = reviewerName(who as UserRow);
		}
		try {
			await writeReviewToAirtable(review as SubmissionReviewRow, submission, reviewedBy);
			return { airtableResent: true };
		} catch (e) {
			return fail(502, { airtableResend: e instanceof Error ? e.message : 'unknown error' });
		}
	},

	/** Mark a submission as possible fraud (or clear the mark). */
	flag: async ({ request, locals }) => {
		const admin = requireReviewer(locals);
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
		const reviewer = requireReviewer(locals);
		const form = await request.formData();
		try {
			const id = uuid(form.get('id')?.toString(), 'submission');
			if ((await getQueued(id))?.user_id === reviewer.id) return fail(403, { message: "You can't review your own project." });
			await setQueuedHardware(id, form.get('hardware') === 'yes');
			return { hardwareSaved: true };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message });
			throw e;
		}
	},

	saveNew: async ({ request, locals, url }) => {
		const reviewer = requireReviewer(locals);
		const form = await request.formData();

		let id: string;
		try {
			id = uuid(form.get('id')?.toString(), 'submission');
			const row = await getQueued(id);
			if (!row) return fail(404, { message: 'That submission no longer exists.' });
			if (row.status === 'sent') return fail(409, { message: 'This one has already been sent to Hack Club.' });
			if (row.user_id === reviewer.id) return fail(403, { message: "You can't review your own project." });
			keepStoredAddress(form, reviewer, row);

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
			const typedNotes = text(form.get('internal_notes'), 'Private notes', { max: 4000 });
			// a shadow reviewer's decision is marked as theirs; drafts stay as typed
			const internalNotes = decision === 'draft' ? typedNotes : shadowNotes(reviewer, typedNotes);
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
				if (result.airtableError) {
					// approved and credited, but Hack Club's fields didn't take: open it
					// so the error and the resend button are right there
					await payForReview(reviewer, 'new', id, fields.project_name, row.status === 'pending', row.updated_at).catch((e) =>
						console.error('payForReview', e)
					);
					redirect(
						303,
						`/admin/reviews?status=approved&submission=${result.airtableRecordId}&airtable_error=${encodeURIComponent(result.airtableError.slice(0, 300))}`
					);
				}
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
			// non-admin reviewers earn hours for each submission they decide
			await payForReview(reviewer, 'new', id, fields.project_name, row.status === 'pending', row.updated_at).catch((e) =>
				console.error('payForReview', e)
			);
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
		const reviewer = requireReviewer(locals);
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
			const typedNotes = text(form.get('internal_notes'), 'Internal notes', { max: 4000 });
			const internalNotes =
				status === 'pending' || status === 'in_review' ? typedNotes : shadowNotes(reviewer, typedNotes);
			const participantFeedback = text(form.get('participant_feedback'), 'Feedback', {
				max: 4000
			});
			// whose hours these are comes from the submission itself, never the form
			const linked = await getHackClubSubmission(airtableRecordId);
			if (linked?.airtable_status === AIRTABLE_GONE) {
				return fail(409, { message: "This submission was deleted from Hack Club's Airtable, so there's nothing to review." });
			}
			if (!linked?.user_id) return fail(400, { message: 'Link this submission to an account first.' });
			const userId = linked.user_id;
			if (userId === reviewer.id) return fail(403, { message: "You can't review your own project." });

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
			if (status !== 'pending' && status !== 'in_review') {
				await payForReview(
					reviewer,
					'hc',
					airtableRecordId,
					hackatimeProject,
					review.status === 'pending' || review.status === 'in_review',
					review.updated_at
				).catch((e) => console.error('payForReview', e));
			}

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
					submission,
					isReviewerOnly(reviewer) && status !== 'pending' && status !== 'in_review' ? reviewerName(reviewer) : null
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

