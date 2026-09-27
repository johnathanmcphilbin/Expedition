import { db } from './supabase';
import { createSubmission, writeReviewToAirtable } from './airtable';
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

export async function queueSubmission(
	userId: string,
	hackatimeUserId: string,
	fields: SubmissionFields,
	screenshot: File
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
			screenshot_name: screenshot.name || `screenshot.${ext}`
		})
		.select('*')
		.single();
	if (error) {
		await db().storage.from(BUCKET).remove([path]);
		throw new Error(`Couldn't save the submission: ${error.message}`);
	}
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
export async function updateQueuedFields(id: string, fields: SubmissionFields): Promise<void> {
	const { error } = await db()
		.from('submission_queue')
		.update(fields)
		.eq('id', id)
		.neq('status', 'sent');
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
}): Promise<{ ok: true; airtableRecordId: string } | { ok: false; message: string }> {
	const q = await getQueued(params.id);
	if (!q) return { ok: false, message: 'That submission no longer exists.' };
	if (q.status === 'sent') return { ok: false, message: 'This one has already been sent to Hack Club.' };

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
					projectName: q.project_name,
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
				}
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
		project_names_raw: q.project_name,
		airtable_status: null,
		airtable_created_at: createdTime,
		synced_at: new Date().toISOString()
	};
	const cache = await db().from('hackclub_submissions').upsert(cached, { onConflict: 'airtable_record_id' });
	if (cache.error) {
		return { ok: false, message: `Sent to Hack Club, but couldn't record it here: ${cache.error.message}. Try again.` };
	}

	const review = await getOrCreateReview(recordId, q.user_id, q.project_name, params.submittedHours);
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

	try {
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
			params.reviewer
		);
	} catch (e) {
		// the row and the hours are in; only the override fields are missing
		console.error('sendQueued: writing review fields', e);
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
			country: null,
			zip: null,
			screenshot_path: null
		})
		.eq('id', q.id);
	if (q.screenshot_path) await db().storage.from(BUCKET).remove([q.screenshot_path]);

	return { ok: true, airtableRecordId: recordId };
}
