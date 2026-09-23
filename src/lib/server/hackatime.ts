import { config } from './env';
import { db } from './supabase';
import type { HackatimeConnectionRow } from './database.types';

/**
 * Hackatime connection.
 *
 * This is an EVIDENCE source, not an awarder of hours. Nothing here ever writes
 * to hour_transactions — a reviewer looks at the tracked time and decides how
 * many hours to approve. Tokens stay server-side and are never serialised into
 * anything a load function returns to the browser.
 *
 * Scope is deliberately limited to `profile read`; admin is never requested.
 */

export function authorizeUrl(redirectUri: string, state: string): string {
	const u = new URL(config.hackatime.authorizeUrl);
	u.searchParams.set('client_id', config.hackatime.clientId);
	u.searchParams.set('redirect_uri', redirectUri);
	u.searchParams.set('response_type', 'code');
	u.searchParams.set('scope', config.hackatime.scope);
	u.searchParams.set('state', state);
	return u.toString();
}

interface TokenResponse {
	access_token?: string;
	refresh_token?: string;
	expires_in?: number;
	scope?: string;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
	const res = await fetch(config.hackatime.tokenUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Accept: 'application/json'
		},
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: redirectUri,
			client_id: config.hackatime.clientId,
			client_secret: config.hackatime.clientSecret
		})
	});

	if (!res.ok) throw new Error(`Hackatime token exchange failed (${res.status})`);

	const json = (await res.json()) as TokenResponse;
	if (!json.access_token) throw new Error('Hackatime returned no access token');
	return json;
}

/** The Hackatime user id for this token, used to scope later stats calls. */
export async function fetchHackatimeUserId(accessToken: string): Promise<string | null> {
	try {
		const res = await fetch(`${config.hackatime.apiUrl}/authenticated/me`, {
			headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
		});
		if (!res.ok) return null;
		const json = (await res.json()) as { id?: string | number };
		return json.id != null ? String(json.id) : null;
	} catch {
		return null;
	}
}

export async function saveConnection(
	userId: string,
	tokens: TokenResponse,
	hackatimeUserId: string | null
): Promise<void> {
	const expiresAt = tokens.expires_in
		? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
		: null;

	const { error } = await db().from('hackatime_connections').upsert(
		{
			user_id: userId,
			hackatime_user_id: hackatimeUserId,
			access_token: tokens.access_token!,
			refresh_token: tokens.refresh_token ?? null,
			expires_at: expiresAt,
			scope: tokens.scope ?? config.hackatime.scope
		},
		{ onConflict: 'user_id' }
	);

	if (error) throw new Error(`Could not save Hackatime connection: ${error.message}`);
}

/** Connection status WITHOUT tokens — safe to send to the browser. */
export async function connectionStatus(
	userId: string
): Promise<{ connected: boolean; hackatimeUserId: string | null; connectedAt: string | null }> {
	const { data } = await db()
		.from('hackatime_connections')
		.select('hackatime_user_id, connected_at')
		.eq('user_id', userId)
		.maybeSingle();

	return {
		connected: !!data,
		hackatimeUserId: data?.hackatime_user_id ?? null,
		connectedAt: data?.connected_at ?? null
	};
}

export interface HackatimeProjectTime {
	name: string;
	totalSeconds: number;
	languages: string[];
	archived: boolean;
	/** ISO timestamp of the last heartbeat, or null if Hackatime never sent one. */
	mostRecentHeartbeat: string | null;
}

/**
 * The Hackatime projects behind this user's OAuth token — the list a
 * participant picks "what you're building" from during onboarding, and the
 * source of truth `getOwnedProject` submissions are checked against.
 *
 * `/authenticated/projects` is scoped to the token itself, unlike the old
 * `/users/{id}/stats` call this replaced, which needed `hackatime_user_id`
 * looked up first and only returned the numbers, not language or archived
 * state. Returns null when there is no connection or Hackatime is
 * unreachable, so a reviewer sees "unavailable" rather than a crashed page —
 * this is supporting evidence, not a hard dependency.
 */
export async function fetchProjectTimes(userId: string): Promise<HackatimeProjectTime[] | null> {
	const { data: conn } = await db()
		.from('hackatime_connections')
		.select('*')
		.eq('user_id', userId)
		.maybeSingle();

	const connection = conn as HackatimeConnectionRow | null;
	if (!connection) return null;

	try {
		const res = await fetch(`${config.hackatime.apiUrl}/authenticated/projects`, {
			headers: {
				Authorization: `Bearer ${connection.access_token}`,
				Accept: 'application/json'
			},
			signal: AbortSignal.timeout(8000)
		});
		if (!res.ok) return null;

		const json = (await res.json()) as {
			projects?: Array<{
				name?: string;
				total_seconds?: number;
				languages?: string[];
				archived?: boolean;
				most_recent_heartbeat?: string | null;
			}>;
		};

		return (json.projects ?? [])
			.filter((p) => p.name)
			.map((p) => ({
				name: p.name as string,
				totalSeconds: Number(p.total_seconds ?? 0),
				languages: p.languages ?? [],
				archived: !!p.archived,
				mostRecentHeartbeat: p.most_recent_heartbeat ?? null
			}))
			.sort((a, b) => b.totalSeconds - a.totalSeconds);
	} catch {
		return null;
	}
}

export function formatHours(totalSeconds: number): string {
	const h = Math.floor(totalSeconds / 3600);
	const m = Math.round((totalSeconds % 3600) / 60);
	return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
