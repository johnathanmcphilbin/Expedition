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
	// Expedition's own review answer, filled in directly on this row
	'Expedition Hackatime Project'?: string;
	'Expedition Approved Hours'?: number;
	'Expedition Review Status'?: string;
	'Expedition Reviewer Notes'?: string;
	'Expedition Feedback to Participant'?: string;
	'Expedition Reviewer'?: string;
	'Expedition Reviewed At'?: string;
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

	const rows: Omit<HackClubSubmissionRow, 'synced_at'>[] = records.map((r) => {
		const hackatimeUserId = r.fields['Justification - Submitter Hackatime ID']?.trim() || null;
		return {
			airtable_record_id: r.id,
			user_id: hackatimeUserId ? (byHackatimeId.get(hackatimeUserId) ?? null) : null,
			hackatime_user_id: hackatimeUserId,
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

	const res = await fetch(
		`${API_BASE}/${config.airtable.baseId}/${config.airtable.submissionTableId}/${submission.airtable_record_id}`,
		{
			method: 'PATCH',
			headers: headers(),
			signal: AbortSignal.timeout(15000),
			body: JSON.stringify({
				fields: {
					'Expedition Hackatime Project': review.hackatime_project,
					'Expedition Approved Hours': review.approved_hours ?? undefined,
					'Expedition Review Status': statusLabel[review.status],
					'Expedition Reviewer Notes': review.internal_notes ?? '',
					'Expedition Feedback to Participant': review.participant_feedback ?? '',
					'Expedition Reviewer': reviewer?.display_name ?? reviewer?.email ?? '',
					'Expedition Reviewed At': review.reviewed_at ?? undefined
				}
			})
		}
	);

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Could not write review to Airtable (${res.status}): ${body.slice(0, 300)}`);
	}
}
