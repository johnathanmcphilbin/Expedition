import { config } from './env';
import { db } from './supabase';
import type { HackClubSubmissionRow, SubmissionReviewRow, UserRow } from './database.types';

/**
 * Hack Club's Unified YSWS Airtable — the canonical record of what was
 * submitted, and where Expedition's review answer is filled in directly.
 * Expedition's review fields (`Expedition Approved Hours`, `Expedition
 * Review Status`, etc.) live as columns on Hack Club's own submission row —
 * not in a table of Expedition's own — because that's where this org
 * already looks for this kind of answer.
 *
 * All calls are server-side only. `AIRTABLE_API_KEY` is read through
 * `$lib/server/env`, which SvelteKit refuses to bundle into client code.
 */

const API_BASE = 'https://api.airtable.com/v0';

function headers() {
	return { Authorization: `Bearer ${config.airtable.apiKey}`, 'Content-Type': 'application/json' };
}

interface AirtableRecord<F> {
	id: string;
	createdTime: string;
	fields: F;
}

interface SubmissionFields {
	'First Name'?: string;
	'Last Name'?: string;
	Email?: string;
	'GitHub Username'?: string;
	'Code URL'?: string;
	'Playable URL'?: string;
	Description?: string;
	'Justification - Submitter Hackatime ID'?: string;
	'Justification - Hackatime Project Name(s) + Date Range(s)'?: string;
	'Automation - Status'?: string;
	// The only fields on this row meant for a reviewer's own answer — Hack
	// Club's own automation reads these as a manual override of the hours it
	// would otherwise compute. There is no separate status/reviewer/feedback
	// field on this table; Expedition's own review record (submission_reviews)
	// is the real source of truth for those — this is just what Hack Club
	// itself looks at.
	'Optional - Override Hours Spent'?: number;
	'Optional - Override Hours Spent Justification'?: string;
}

/**
 * Every row from Hack Club's "YSWS Project Submission" table, paginated.
 * Read-only — this table belongs to Hack Club's own automation.
 */
async function fetchAllSubmissions(): Promise<AirtableRecord<SubmissionFields>[]> {
	const records: AirtableRecord<SubmissionFields>[] = [];
	let offset: string | undefined;

	do {
		const u = new URL(`${API_BASE}/${config.airtable.baseId}/${config.airtable.submissionTableId}`);
		if (offset) u.searchParams.set('offset', offset);

		const res = await fetch(u, { headers: headers(), signal: AbortSignal.timeout(15000) });
		if (!res.ok) {
			throw new Error(`Airtable submission fetch failed (${res.status})`);
		}
		const json = (await res.json()) as {
			records: AirtableRecord<SubmissionFields>[];
			offset?: string;
		};
		records.push(...json.records);
		offset = json.offset;
	} while (offset);

	return records;
}

/**
 * Sync Hack Club's submissions into the local `hackclub_submissions` cache,
 * matching each one to an Expedition user by Hackatime ID. Returns the
 * synced rows scoped to `onlyHackatimeUserId` when given (cheaper — used for
 * a participant's own dashboard), or every row otherwise (the admin queue).
 *
 * The cache exists purely for read performance; a row missing from it means
 * "not synced yet", never "not submitted" — callers that need a definitive
 * answer should sync first.
 */
export async function syncHackClubSubmissions(
	onlyHackatimeUserId?: string
): Promise<HackClubSubmissionRow[]> {
	const records = await fetchAllSubmissions();

	// Match every submitter's typed Hackatime ID against known connections in
	// one query, rather than one round trip per record.
	const { data: connections } = await db()
		.from('hackatime_connections')
		.select('user_id, hackatime_user_id');
	const byHackatimeId = new Map<string, string>(
		((connections ?? []) as { user_id: string; hackatime_user_id: string | null }[])
			.filter((c) => c.hackatime_user_id)
			.map((c) => [c.hackatime_user_id as string, c.user_id])
	);

	// A submission that was already matched to an account (whether by a
	// previous sync, or by hand) stays matched even if this pass can't derive
	// a match itself — e.g. Hack Club's form never captured a Hackatime ID
	// for it. Re-syncing must never regress an existing match back to null.
	const { data: existing } = await db()
		.from('hackclub_submissions')
		.select('airtable_record_id, user_id, hackatime_user_id');
	const existingById = new Map<string, { user_id: string | null; hackatime_user_id: string | null }>(
		((existing ?? []) as { airtable_record_id: string; user_id: string | null; hackatime_user_id: string | null }[])
			.map((e) => [e.airtable_record_id, { user_id: e.user_id, hackatime_user_id: e.hackatime_user_id }])
	);

	const rows: Omit<HackClubSubmissionRow, 'synced_at'>[] = records.map((r) => {
		const hackatimeUserId = r.fields['Justification - Submitter Hackatime ID']?.trim() || null;
		const matchedUserId = hackatimeUserId ? (byHackatimeId.get(hackatimeUserId) ?? null) : null;
		const prior = existingById.get(r.id);
		return {
			airtable_record_id: r.id,
			user_id: matchedUserId ?? prior?.user_id ?? null,
			hackatime_user_id: hackatimeUserId ?? prior?.hackatime_user_id ?? null,
			first_name: r.fields['First Name'] ?? null,
			last_name: r.fields['Last Name'] ?? null,
			email: r.fields['Email'] ?? null,
			github_username: r.fields['GitHub Username'] ?? null,
			code_url: r.fields['Code URL'] ?? null,
			playable_url: r.fields['Playable URL'] ?? null,
			description: r.fields['Description'] ?? null,
			project_names_raw:
				r.fields['Justification - Hackatime Project Name(s) + Date Range(s)'] ?? null,
			airtable_status: r.fields['Automation - Status'] ?? null,
			airtable_created_at: r.createdTime
		};
	});

	const scoped = onlyHackatimeUserId
		? rows.filter((r) => r.hackatime_user_id === onlyHackatimeUserId)
		: rows;
	if (!scoped.length) return [];

	const { data, error } = await db()
		.from('hackclub_submissions')
		.upsert(
			scoped.map((r) => ({ ...r, synced_at: new Date().toISOString() })),
			{ onConflict: 'airtable_record_id' }
		)
		.select('*');

	if (error) throw new Error(`Could not cache Hack Club submissions: ${error.message}`);
	return (data ?? []) as HackClubSubmissionRow[];
}

export interface NewSubmission {
	hackatimeUserId: string;
	projectName: string;
	codeUrl: string;
	playableUrl: string;
	description: string;
	firstName: string;
	lastName: string;
	email: string;
	githubUsername: string;
	birthday: string;
	addressLine1: string;
	addressLine2: string | null;
	city: string;
	state: string;
	country: string;
	zip: string;
	heardAbout: string | null;
	doingWell: string | null;
	improve: string | null;
}

/**
 * Create a row in Hack Club's own submission table, the same row their
 * Airtable form would have created — but with the Hackatime ID set here on
 * the server, so it can't go missing the way the embedded form's prefill
 * did. The screenshot is uploaded straight onto the new row afterwards; if
 * that fails the row is removed again, so a retry never leaves a duplicate.
 */
export async function createSubmission(
	s: NewSubmission,
	screenshot: { bytes: ArrayBuffer; contentType: string; filename: string }
): Promise<{ id: string; createdTime: string }> {
	const table = `${API_BASE}/${config.airtable.baseId}/${config.airtable.submissionTableId}`;

	const res = await fetch(table, {
		method: 'POST',
		headers: headers(),
		signal: AbortSignal.timeout(15000),
		body: JSON.stringify({
			// lets Airtable coerce plain strings into its own date/select types
			typecast: true,
			records: [
				{
					fields: {
						'Code URL': s.codeUrl,
						'Playable URL': s.playableUrl,
						Description: s.description,
						'First Name': s.firstName,
						'Last Name': s.lastName,
						Email: s.email,
						'GitHub Username': s.githubUsername,
						Birthday: s.birthday,
						'Address (Line 1)': s.addressLine1,
						'Address (Line 2)': s.addressLine2 ?? undefined,
						City: s.city,
						'State / Province': s.state,
						Country: s.country,
						'ZIP / Postal Code': s.zip,
						'How did you hear about this?': s.heardAbout ?? undefined,
						'What are we doing well?': s.doingWell ?? undefined,
						'How can we improve?': s.improve ?? undefined,
						'Justification - Submitter Hackatime ID': s.hackatimeUserId,
						'Justification - Hackatime Project Name(s) + Date Range(s)': s.projectName
					}
				}
			]
		})
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Airtable rejected the submission (${res.status}): ${body.slice(0, 300)}`);
	}
	const record = ((await res.json()) as { records: AirtableRecord<SubmissionFields>[] }).records[0];

	const upload = await fetch(
		`https://content.airtable.com/v0/${config.airtable.baseId}/${record.id}/${encodeURIComponent('Screenshot')}/uploadAttachment`,
		{
			method: 'POST',
			headers: headers(),
			signal: AbortSignal.timeout(30000),
			body: JSON.stringify({
				contentType: screenshot.contentType,
				filename: screenshot.filename,
				file: Buffer.from(screenshot.bytes).toString('base64')
			})
		}
	);
	if (!upload.ok) {
		const body = await upload.text();
		await fetch(`${table}/${record.id}`, { method: 'DELETE', headers: headers() }).catch(() => {});
		throw new Error(`Couldn't upload the screenshot (${upload.status}): ${body.slice(0, 300)}`);
	}

	return { id: record.id, createdTime: record.createdTime };
}

/**
 * Write one review decision directly onto Hack Club's own submission row —
 * an ordinary update by record id, not an upsert into a table of
 * Expedition's own. `submission.airtable_record_id` is exactly the record
 * this updates; there is nothing to match or create.
 */
export async function writeReviewToAirtable(
	review: SubmissionReviewRow,
	submission: HackClubSubmissionRow,
	reviewer: UserRow | null
): Promise<void> {
	const statusLabel: Record<SubmissionReviewRow['status'], string> = {
		pending: 'Pending',
		in_review: 'Pending',
		approved: 'Approved',
		changes_requested: 'Needs Changes',
		rejected: 'Rejected'
	};

	const justification = [
		`Expedition review: ${statusLabel[review.status]} — ${review.hackatime_project}`,
		reviewer && `Reviewer: ${reviewer.display_name ?? reviewer.email ?? reviewer.hackclub_id}`,
		review.reviewed_at && `Reviewed at: ${new Date(review.reviewed_at).toLocaleString()}`,
		review.participant_feedback && `Feedback to participant: ${review.participant_feedback}`,
		review.internal_notes && `Internal notes: ${review.internal_notes}`
	]
		.filter(Boolean)
		.join('\n');

	const res = await fetch(
		`${API_BASE}/${config.airtable.baseId}/${config.airtable.submissionTableId}/${submission.airtable_record_id}`,
		{
			method: 'PATCH',
			headers: headers(),
			signal: AbortSignal.timeout(15000),
			body: JSON.stringify({
				fields: {
					'Optional - Override Hours Spent': review.approved_hours ?? undefined,
					'Optional - Override Hours Spent Justification': justification
				}
			})
		}
	);

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Could not write review to Airtable (${res.status}): ${body.slice(0, 300)}`);
	}
}
