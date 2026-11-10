/**
 * Optional hand-off to Hack Club Attend.
 *
 * Documented endpoint (off unless both env vars are set):
 *   POST https://attend.hackclub.com/api/v1/events/{event_id}/participants
 *   Authorization: Bearer <event or series API key>
 *   body: { email, first_name, last_name, country, state }
 *
 * That creates an `invited` registration, the same state as a CSV import,
 * and emails the invitation unless the event is holding invites.
 * https://attend.hackclub.com/docs/api-reference/participants/invite-a-participant
 *
 * The body only includes fields that page documents. School, GitHub and
 * "something built" stay in our CSV; they are not part of this request.
 */

export type AttendConfig = {
	token: string;
	eventId: string;
	baseUrl: string;
};

export function attendConfigFromEnv(env: {
	ATTEND_API_TOKEN?: string;
	ATTEND_EVENT_ID?: string;
	ATTEND_API_BASE?: string;
}): AttendConfig | null {
	const token = env.ATTEND_API_TOKEN?.trim() ?? '';
	const eventId = env.ATTEND_EVENT_ID?.trim() ?? '';
	if (!token || !eventId) return null;
	const baseUrl = (env.ATTEND_API_BASE?.trim() || 'https://attend.hackclub.com/api/v1').replace(/\/+$/, '');
	return { token, eventId, baseUrl };
}

export type AttendInviteInput = {
	email: string;
	firstName: string;
	lastName: string;
	county: string;
};

export type AttendInviteResult =
	| { ok: true; participantEventId: string | null; held: boolean; already: boolean }
	| { ok: false; error: string };

export async function inviteParticipant(
	config: AttendConfig,
	person: AttendInviteInput,
	fetchImpl: typeof fetch = fetch
): Promise<AttendInviteResult> {
	const url = `${config.baseUrl}/events/${encodeURIComponent(config.eventId)}/participants`;
	let res: Response;
	try {
		res = await fetchImpl(url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${config.token}`,
				'Content-Type': 'application/json',
				Accept: 'application/json'
			},
			body: JSON.stringify({
				email: person.email,
				first_name: person.firstName,
				last_name: person.lastName,
				country: 'Ireland',
				state: person.county
			}),
			signal: AbortSignal.timeout(12_000)
		});
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Attend request failed';
		return { ok: false, error: message };
	}

	const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
	if (res.status === 201) {
		return {
			ok: true,
			participantEventId: typeof body?.participant_event_id === 'string' ? body.participant_event_id : null,
			held: body?.held === true,
			already: false
		};
	}
	// Already invited or already registered. They're on the roster.
	if (res.status === 409) {
		return { ok: true, participantEventId: null, held: false, already: true };
	}
	const message = body && typeof body.error === 'string' ? body.error : `Attend returned ${res.status}`;
	return { ok: false, error: message.slice(0, 500) };
}
