import { describe, expect, it } from 'vitest';
import { attendConfigFromEnv, inviteParticipant, type AttendConfig } from './attend';

const config: AttendConfig = {
	token: 'test-token',
	eventId: 'expedition',
	baseUrl: 'https://attend.hackclub.com/api/v1'
};

function mockFetch(status: number, body: unknown): { fetchImpl: typeof fetch; calls: { url: string; body: unknown; auth: string }[] } {
	const calls: { url: string; body: unknown; auth: string }[] = [];
	const fetchImpl: typeof fetch = async (input, init) => {
		const headers = new Headers(init?.headers);
		calls.push({
			url: String(input),
			body: JSON.parse(String(init?.body)),
			auth: headers.get('Authorization') ?? ''
		});
		return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
	};
	return { fetchImpl, calls };
}

describe('Attend config', () => {
	it('stays off until both the token and the event id are set', () => {
		expect(attendConfigFromEnv({})).toBeNull();
		expect(attendConfigFromEnv({ ATTEND_API_TOKEN: 'tok' })).toBeNull();
		expect(attendConfigFromEnv({ ATTEND_EVENT_ID: 'expedition' })).toBeNull();
		expect(attendConfigFromEnv({ ATTEND_API_TOKEN: '  ', ATTEND_EVENT_ID: 'expedition' })).toBeNull();
		expect(
			attendConfigFromEnv({ ATTEND_API_TOKEN: ' tok ', ATTEND_EVENT_ID: ' expedition ' })
		).toEqual({
			token: 'tok',
			eventId: 'expedition',
			baseUrl: 'https://attend.hackclub.com/api/v1'
		});
	});

	it('uses a custom base URL without a trailing slash', () => {
		expect(
			attendConfigFromEnv({
				ATTEND_API_TOKEN: 'tok',
				ATTEND_EVENT_ID: 'expedition',
				ATTEND_API_BASE: 'http://localhost:3000/api/v1/'
			})?.baseUrl
		).toBe('http://localhost:3000/api/v1');
	});
});

describe('Attend invite', () => {
	const person = {
		email: 'aoife@school.ie',
		firstName: 'Aoife',
		lastName: 'Ní Bhriain',
		county: 'Galway'
	};

	it('posts only the documented fields to the invite endpoint', async () => {
		const { fetchImpl, calls } = mockFetch(201, {
			success: true,
			participant_event_id: 'pe_1',
			held: false
		});
		const result = await inviteParticipant(config, person, fetchImpl);
		expect(result).toEqual({ ok: true, participantEventId: 'pe_1', held: false, already: false });
		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe('https://attend.hackclub.com/api/v1/events/expedition/participants');
		expect(calls[0]?.auth).toBe('Bearer test-token');
		expect(calls[0]?.url).not.toContain('test-token');
		expect(Object.keys(calls[0]?.body as object).sort()).toEqual([
			'country',
			'email',
			'first_name',
			'last_name',
			'state'
		]);
		expect(calls[0]?.body).toEqual({
			email: 'aoife@school.ie',
			first_name: 'Aoife',
			last_name: 'Ní Bhriain',
			country: 'Ireland',
			state: 'Galway'
		});
	});

	it('treats 409 as already on the roster', async () => {
		const { fetchImpl } = mockFetch(409, { success: false, error: 'This email is already registered for this event' });
		const result = await inviteParticipant(config, person, fetchImpl);
		expect(result).toEqual({ ok: true, participantEventId: null, held: false, already: true });
	});

	it('records a held invitation and surfaces Attend’s error text', async () => {
		const held = mockFetch(201, { success: true, participant_event_id: 'pe_2', held: true });
		expect((await inviteParticipant(config, person, held.fetchImpl)).ok && true).toBe(true);
		const bad = mockFetch(422, { success: false, error: 'Email is banned' });
		const result = await inviteParticipant(config, person, bad.fetchImpl);
		expect(result).toEqual({ ok: false, error: 'Email is banned' });
	});

	it('does not throw when the request fails', async () => {
		const fetchImpl: typeof fetch = async () => {
			throw new Error('network down');
		};
		const result = await inviteParticipant(config, person, fetchImpl);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('network down');
	});
});
