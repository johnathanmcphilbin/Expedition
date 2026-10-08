import { isReviewerOnly, reviewerName } from './guards';
import { recordOrigin } from './origins';
import { db } from './supabase';
import { createSubmission, writeReviewToAirtable, saveJustifications, type Justifications } from './airtable';
import { getOrCreateReview } from './queries';
import { submitReview } from './review';
import type { SubmissionFields } from './submission-fields';
import type { QueuedSubmissionRow, QueuedSubmissionStatus, UserRow } from './database.types';

/**
 * The second pass. A participant's submission waits in `submission_queue`
 * until an Expedition reviewer approves it; only then is it written into
 * Hack Club's Airtable and the hours credited. See
 * supabase/migrations/0010_submission_queue.sql.
 */

const BUCKET = 'submission-screenshots';

/**
 * The Hackatime projects a submission covers. Rows from before multi-project
 * support only have project_name; hardware not tracked in Hackatime has none.
 */
export function hackatimeNames(q: Pick<QueuedSubmissionRow, 'hackatime_projects' | 'project_name' | 'hardware'>): string[] {
	if (q.hackatime_projects?.length) return q.hackatime_projects;
	return q.hardware ? [] : [q.project_name];
}

export async function queueSubmission(
	userId: string,
	hackatimeUserId: string,
	fields: SubmissionFields,
	screenshot: File,
	libraryOptIn = false,
	/** Hack Club justification fields they filled in themselves (e.g. Lapse links) */
	justifications: Justifications = {}
): Promise<QueuedSubmissionRow> {
	const ext = (screenshot.name.match(/\.(\w{2,5})$/)?.[1] ?? 'png').toLowerCase();
	const path = `${userId}/${crypto.randomUUID()}.${ext}`;

	const up = await db()
		.storage.from(BUCKET)
		.upload(path, await screenshot.arrayBuffer(), { contentType: screenshot.type, upsert: false });
	if (up.error) throw new Error(`Couldn't store the screenshot: ${up.error.message}`);

	const { data, error } = await db()
		.from('submission_queue')
		.insert({
			...fields,
			user_id: userId,
			hackatime_user_id: hackatimeUserId,
			screenshot_path: path,
			screenshot_type: screenshot.type,
			screenshot_name: screenshot.name || `screenshot.${ext}`,
			library_opt_in: libraryOptIn,
			justifications
		})
		.select('*')
		.single();
	if (error) {
		await db().storage.from(BUCKET).remove([path]);
		throw new Error(`Couldn't save the submission: ${error.message}`);
	}
	// nearest airport for travel planning; never blocks the submission
	await recordOrigin(userId, { city: fields.city, state: fields.state, country: fields.country }).catch((e) =>
		console.error('recordOrigin', e)
	);
	return data as QueuedSubmissionRow;
}

/** This participant's queued submissions, newest first — for their dashboard. */
export async function listOwnQueued(userId: string): Promise<QueuedSubmissionRow[]> {
	const { data, error } = await db()
		.from('submission_queue')
		.select('*')
		.eq('user_id', userId)
		.order('created_at', { ascending: false });
	if (error) {
		console.error('listOwnQueued', error.message);
		return [];
	}
	return (data ?? []) as QueuedSubmissionRow[];
}

export async function listQueue(): Promise<
	(QueuedSubmissionRow & { owner: Pick<UserRow, 'display_name'> | null })[]
> {
	const { data, error } = await db()
		.from('submission_queue')
		.select('*, users!submission_queue_user_id_fkey(display_name)')
		.order('created_at', { ascending: true });
	if (error) {
		console.error('listQueue', error.message);
		return [];
	}
	return (
		(data ?? []) as unknown as (QueuedSubmissionRow & { users: Pick<UserRow, 'display_name'> | null })[]
	).map(({ users, ...r }) => ({ ...r, owner: users }));
}

export async function countQueuePending(): Promise<number> {
	const { count, error } = await db()
		.from('submission_queue')
		.select('id', { count: 'exact', head: true })
		.eq('status', 'pending');
	if (error) return 0;
	return count ?? 0;
}

export async function getQueued(id: string): Promise<QueuedSubmissionRow | null> {
	const { data } = await db().from('submission_queue').select('*').eq('id', id).maybeSingle();
	return (data as QueuedSubmissionRow | null) ?? null;
}

/** A short-lived link so the reviewer can see the screenshot. */
export async function screenshotUrl(path: string | null): Promise<string | null> {
	if (!path) return null;
	const { data } = await db().storage.from(BUCKET).createSignedUrl(path, 60 * 60);
	return data?.signedUrl ?? null;
}

/** A reviewer's edits to what was submitted. Not allowed once it's been sent. */
export async function updateQueuedFields(
	id: string,
	fields: SubmissionFields,
	justifications?: Justifications
): Promise<void> {
	const { error } = await db()
		.from('submission_queue')
		.update(justifications ? { ...fields, justifications } : fields)
		.eq('id', id)
		.neq('status', 'sent');
	if (error) throw new Error(error.message);
}

/** Move a not-yet-sent submission between the software and hardware queues. */
export async function setQueuedHardware(id: string, hardware: boolean): Promise<void> {
	const { error } = await db().from('submission_queue').update({ hardware }).eq('id', id).neq('status', 'sent');
	if (error) throw new Error(error.message);
}

/** Needs changes / reject / back to pending: stays in Expedition only. */
export async function decideQueued(
	id: string,
	reviewerId: string,
	status: Exclude<QueuedSubmissionStatus, 'sent'>,
	approvedHours: number | null,
	internalNotes: string | null,
	participantFeedback: string | null
): Promise<void> {
	const { error } = await db()
		.from('submission_queue')
		.update({
			status,
			approved_hours: approvedHours,
			internal_notes: internalNotes,
			participant_feedback: participantFeedback,
			reviewer_id: status === 'pending' ? null : reviewerId,
			reviewed_at: status === 'pending' ? null : new Date().toISOString()
		})
		.eq('id', id)
		.neq('status', 'sent');
	if (error) throw new Error(error.message);
}

/** Back to waiting, keeping any notes and feedback already written. */
export async function reopenQueued(id: string): Promise<void> {
	const { error } = await db()
		.from('submission_queue')
		.update({ status: 'pending', reviewer_id: null, reviewed_at: null })
		.eq('id', id)
		.in('status', ['rejected', 'changes_requested']);
	if (error) throw new Error(error.message);
}

/**
 * Approve: create the row in Hack Club's Airtable, cache it, credit the hours
 * through review_hackclub_submission(), write the approved hours and
 * justification back onto the row, then clear the personal details and the
 * screenshot from Expedition's copy.
 *
 * Safe to retry: the Airtable record id is saved the moment Airtable accepts
 * the row, so a failure after that point never creates a second row, and the
 * hours can only be credited once (unique index on the ledger).
 */
export async function sendQueued(params: {
	id: string;
	reviewer: UserRow;
	approvedHours: number;
	internalNotes: string | null;
	participantFeedback: string | null;
	submittedHours: number | null;
}): Promise<{ ok: true; airtableRecordId: string; airtableError: string | null } | { ok: false; message: string }> {
	const q = await getQueued(params.id);
	if (!q) return { ok: false, message: 'That submission no longer exists.' };
	if (q.status === 'sent') return { ok: false, message: 'This one has already been sent to Hack Club.' };

	// Claim it first, so a double click or two reviewers at once can't create
	// two Airtable rows and credit the hours twice. A lock older than two
	// minutes is from a request that died and can be taken over.
	const stale = new Date(Date.now() - 2 * 60 * 1000).toISOString();
	const { data: locked, error: lockError } = await db()
		.from('submission_queue')
		.update({ sending_at: new Date().toISOString() })
		.eq('id', q.id)
		.neq('status', 'sent')
		.or(`sending_at.is.null,sending_at.lt.${stale}`)
		.select('id');
	if (lockError) return { ok: false, message: `Couldn't start sending it: ${lockError.message}` };
	if (!locked?.length) return { ok: false, message: 'This one is already being sent. Refresh in a moment.' };

	try {
		return await sendLocked(q, params);
	} finally {
		await db().from('submission_queue').update({ sending_at: null }).eq('id', q.id);
	}
}

async function sendLocked(
	q: QueuedSubmissionRow,
	params: Parameters<typeof sendQueued>[0]
): Promise<{ ok: true; airtableRecordId: string; airtableError: string | null } | { ok: false; message: string }> {

	const projects = hackatimeNames(q);
	// Hack Club's field takes several names; commas are how their form lists them.
	// Hardware with no Hackatime project says so rather than inventing one.
	const projectsForHackClub = projects.length ? projects.join(', ') : `None: hardware project "${q.project_name}", hours from its JOURNAL.md`;

	let recordId = q.airtable_record_id;
	let createdTime = new Date().toISOString();

	if (!recordId) {
		if (!q.screenshot_path || !q.birthday || !q.address_line1 || !q.city || !q.state || !q.country || !q.zip) {
			return { ok: false, message: 'This submission is missing its screenshot or address details.' };
		}
		const file = await db().storage.from(BUCKET).download(q.screenshot_path);
		if (file.error || !file.data) {
			return { ok: false, message: "Couldn't load the screenshot to send it. Try again." };
		}
		try {
			const record = await createSubmission(
				{
					hackatimeUserId: q.hackatime_user_id,
					projectName: projectsForHackClub,
					codeUrl: q.code_url,
					playableUrl: q.playable_url,
					description: q.description,
					firstName: q.first_name,
					lastName: q.last_name,
					email: q.email,
					githubUsername: q.github_username,
					birthday: q.birthday,
					addressLine1: q.address_line1,
					addressLine2: q.address_line2,
					city: q.city,
					state: q.state,
					country: q.country,
					zip: q.zip,
					heardAbout: q.heard_about,
					doingWell: q.doing_well,
					improve: q.improve
				},
				{
					bytes: await file.data.arrayBuffer(),
					contentType: q.screenshot_type ?? 'image/png',
					filename: q.screenshot_name ?? 'screenshot.png'
				},
				q.justifications ?? {}
			);
			recordId = record.id;
			createdTime = record.createdTime;
		} catch (e) {
			console.error('sendQueued: airtable create', e);
			return { ok: false, message: "Airtable didn't accept it. Nothing was sent, so you can try again." };
		}
		await db().from('submission_queue').update({ airtable_record_id: recordId }).eq('id', q.id);
	}

	// Cache it, already linked to the participant, so the ledger credit and
	// their dashboard have a row to point at.
	const cached = {
		airtable_record_id: recordId,
		user_id: q.user_id,
		hackatime_user_id: q.hackatime_user_id,
		first_name: q.first_name,
		last_name: q.last_name,
		email: q.email,
		github_username: q.github_username,
		code_url: q.code_url,
		playable_url: q.playable_url,
		description: q.description,
		project_names_raw: projectsForHackClub,
		airtable_status: null,
		country: q.country,
		airtable_created_at: createdTime,
		synced_at: new Date().toISOString()
	};
	const cache = await db().from('hackclub_submissions').upsert(cached, { onConflict: 'airtable_record_id' });
	if (cache.error) {
		return { ok: false, message: `Sent to Hack Club, but couldn't record it here: ${cache.error.message}. Try again.` };
	}

	const review = await getOrCreateReview(recordId, q.user_id, q.project_name, params.submittedHours, projects);
	const result = await submitReview({
		reviewId: review.id,
		reviewerId: params.reviewer.id,
		status: 'approved',
		approvedHours: params.approvedHours,
		internalNotes: params.internalNotes,
		participantFeedback: params.participantFeedback,
		submittedHours: params.submittedHours
	});
	// "already decided" means a previous attempt got this far; carry on
	if (!result.ok && !/already/i.test(result.message)) return { ok: false, message: result.message };

	let airtableError: string | null = null;
	try {
		// a resumed send (its Airtable row made on an earlier try) brings the
		// row's justifications up to date with what's been edited since
		if (q.airtable_record_id && Object.keys(q.justifications ?? {}).length) {
			await saveJustifications(recordId, q.justifications);
		}
		await writeReviewToAirtable(
			{
				...review,
				status: 'approved',
				approved_hours: params.approvedHours,
				internal_notes: params.internalNotes,
				participant_feedback: params.participantFeedback,
				reviewer_id: params.reviewer.id,
				reviewed_at: new Date().toISOString()
			},
			{ ...cached, synced_at: cached.synced_at },
			isReviewerOnly(params.reviewer) ? reviewerName(params.reviewer) : null
		);
	} catch (e) {
		// the row and the hours are in here; only Hack Club's override fields
		// are missing. Reported back so the reviewer sees it and can resend.
		console.error('sendQueued: writing review fields', e);
		airtableError = e instanceof Error ? e.message : 'unknown error';
	}

	await db()
		.from('submission_queue')
		.update({
			status: 'sent',
			sent_at: new Date().toISOString(),
			approved_hours: params.approvedHours,
			internal_notes: params.internalNotes,
			participant_feedback: params.participantFeedback,
			reviewer_id: params.reviewer.id,
			reviewed_at: new Date().toISOString(),
			birthday: null,
			address_line1: null,
			address_line2: null,
			city: null,
			state: null,
			// country stays, for where-people-are-from analytics
			zip: null,
			// a library project keeps its screenshot to show there
			...(q.library_opt_in ? {} : { screenshot_path: null })
		})
		.eq('id', q.id);
	if (q.screenshot_path && !q.library_opt_in) await db().storage.from(BUCKET).remove([q.screenshot_path]);

	return { ok: true, airtableRecordId: recordId, airtableError };
}

/**
 * Approved projects whose builder ticked "show this in the library". Only
 * public-safe columns are selected: first name, project, links, description
 * and the screenshot — never surname, email, birthday or address.
 */
export async function listLibraryProjects(limit = 120): Promise<
	{ id: string; first_name: string; project: string; description: string; code_url: string; playable_url: string; hardware: boolean; image_url: string | null; sent_at: string | null }[]
> {
	const { data, error } = await db()
		.from('submission_queue')
		.select('id, first_name, project_name, description, code_url, playable_url, hardware, screenshot_path, sent_at')
		.eq('status', 'sent')
		.eq('library_opt_in', true)
		.order('sent_at', { ascending: false })
		.limit(limit);
	if (error) {
		console.error('listLibraryProjects', error.message);
		return [];
	}
	const rows = data ?? [];
	const paths = rows.map((r) => r.screenshot_path).filter((p): p is string => !!p);
	const urls = new Map<string, string>();
	if (paths.length) {
		const { data: signed } = await db().storage.from(BUCKET).createSignedUrls(paths, 60 * 60);
		for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
	}
	return rows.map((r) => ({
		id: r.id,
		first_name: (r.first_name ?? 'A builder').trim().split(' ')[0],
		project: r.project_name,
		description: r.description,
		code_url: r.code_url,
		playable_url: r.playable_url,
		hardware: r.hardware,
		image_url: r.screenshot_path ? (urls.get(r.screenshot_path) ?? null) : null,
		sent_at: r.sent_at
	}));
}

/**
 * Rejected and needs-changes submissions never reach Hack Club, so their
 * address, birthday and screenshot would otherwise sit here for good. A
 * month after the decision they're wiped; reopening one after that means
 * the participant resubmits. Runs best-effort when the review page loads.
 */
export async function purgeStalePersonalData(days = 30): Promise<void> {
	const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
	const { data, error } = await db()
		.from('submission_queue')
		.select('id, screenshot_path')
		.in('status', ['rejected', 'changes_requested'])
		.lt('reviewed_at', cutoff)
		.or('address_line1.not.is.null,birthday.not.is.null,screenshot_path.not.is.null');
	if (error || !data?.length) return;
	const ids = data.map((r) => r.id);
	await db()
		.from('submission_queue')
		.update({
			birthday: null,
			address_line1: null,
			address_line2: null,
			city: null,
			state: null,
			zip: null,
			screenshot_path: null
		})
		.in('id', ids);
	const paths = data.map((r) => r.screenshot_path).filter((p): p is string => !!p);
	if (paths.length) await db().storage.from(BUCKET).remove(paths);
}

/**
 * A participant's own submission sent back with "needs changes": what the
 * submit form needs to reopen it with their answers filled in.
 */
export async function getOwnForResubmit(userId: string, id: string) {
	const row = await getQueued(id);
	if (!row || row.user_id !== userId || row.status !== 'changes_requested') return null;
	return {
		id: row.id,
		projects: hackatimeNames(row),
		/** hardware sent in without a Hackatime project: what they called it */
		untrackedName: hackatimeNames(row).length ? null : row.project_name,
		name: row.project_name,
		hardware: row.hardware,
		code_url: row.code_url,
		playable_url: row.playable_url,
		description: row.description,
		lapse: (row.justifications?.['Justification - Lapse Links, comma-separated'] ?? '').replace(/,\s*/g, '\n'),
		birthday: row.birthday,
		address_line1: row.address_line1,
		address_line2: row.address_line2,
		city: row.city,
		state: row.state,
		zip: row.zip,
		country: row.country,
		heard_about: row.heard_about,
		doing_well: row.doing_well,
		improve: row.improve,
		library: row.library_opt_in,
		feedback: row.participant_feedback,
		hasScreenshot: !!row.screenshot_path
	};
}

/**
 * Resubmit after "needs changes": the same submission, updated, back in the
 * queue. A new screenshot replaces the old one; without one the old stays.
 */
export async function resubmitQueued(
	userId: string,
	id: string,
	fields: SubmissionFields,
	screenshot: File | null,
	libraryOptIn: boolean,
	justifications: Justifications
): Promise<boolean> {
	const row = await getQueued(id);
	if (!row || row.user_id !== userId || row.status !== 'changes_requested') return false;

	let shot: { screenshot_path: string; screenshot_type: string; screenshot_name: string } | null = null;
	if (screenshot) {
		const ext = (screenshot.name.match(/\.(\w{2,5})$/)?.[1] ?? 'png').toLowerCase();
		const path = `${userId}/${crypto.randomUUID()}.${ext}`;
		const up = await db()
			.storage.from(BUCKET)
			.upload(path, await screenshot.arrayBuffer(), { contentType: screenshot.type, upsert: false });
		if (up.error) throw new Error(`Couldn't store the screenshot: ${up.error.message}`);
		shot = { screenshot_path: path, screenshot_type: screenshot.type, screenshot_name: screenshot.name || `screenshot.${ext}` };
	}

	const stamp = `[Resubmitted after changes ${new Date().toISOString().slice(0, 10)}]`;
	const { data, error } = await db()
		.from('submission_queue')
		.update({
			...fields,
			...(shot ?? {}),
			library_opt_in: libraryOptIn,
			justifications: { ...(row.justifications ?? {}), ...justifications },
			status: 'pending',
			reviewer_id: null,
			reviewed_at: null,
			// the feedback they acted on stays visible to the reviewer
			internal_notes: row.internal_notes ? `${stamp}\n${row.internal_notes}` : stamp
		})
		.eq('id', id)
		.eq('user_id', userId)
		.eq('status', 'changes_requested')
		.select('id');
	if (error) {
		if (shot) await db().storage.from(BUCKET).remove([shot.screenshot_path]);
		throw new Error(`Couldn't resubmit: ${error.message}`);
	}
	if (!data?.length) return false;
	if (shot && row.screenshot_path) await db().storage.from(BUCKET).remove([row.screenshot_path]);
	return true;
}
