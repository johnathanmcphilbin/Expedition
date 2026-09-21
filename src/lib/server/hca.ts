import { config } from './env';
import { db } from './supabase';
import type { UserRow } from './database.types';

/**
 * Hack Club Auth (auth.hackclub.com) — OIDC authorization-code flow.
 *
 * We are a confidential client: the code exchange happens server-to-server with
 * the client secret, so the ID token arrives directly from the issuer over TLS.
 * We then read claims from the userinfo endpoint rather than parsing the ID
 * token, which keeps us off a JWT library without weakening anything — the
 * claims come straight from the provider on an authenticated channel.
 *
 * `state` is our CSRF defence; the provider does not advertise PKCE support.
 */

export interface HcaClaims {
	sub: string;
	email?: string;
	name?: string;
	nickname?: string;
	given_name?: string;
	picture?: string;
	slack_id?: string;
	verification_status?: string;
	ysws_eligible?: boolean;
}

export function authorizeUrl(redirectUri: string, state: string): string {
	const u = new URL(config.hca.authorizeUrl);
	u.searchParams.set('client_id', config.hca.clientId);
	u.searchParams.set('redirect_uri', redirectUri);
	u.searchParams.set('response_type', 'code');
	u.searchParams.set('scope', config.hca.scope);
	u.searchParams.set('state', state);
	return u.toString();
}

export async function exchangeCode(code: string, redirectUri: string): Promise<string> {
	const res = await fetch(config.hca.tokenUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Accept: 'application/json'
		},
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: redirectUri,
			client_id: config.hca.clientId,
			client_secret: config.hca.clientSecret
		})
	});

	if (!res.ok) {
		// Log status only. The body can echo request parameters.
		throw new Error(`Hack Club Auth token exchange failed (${res.status})`);
	}

	const json = (await res.json()) as { access_token?: string };
	if (!json.access_token) throw new Error('Hack Club Auth returned no access token');
	return json.access_token;
}

export async function fetchClaims(accessToken: string): Promise<HcaClaims> {
	const res = await fetch(config.hca.userinfoUrl, {
		headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
	});
	if (!res.ok) throw new Error(`Hack Club Auth userinfo failed (${res.status})`);

	const claims = (await res.json()) as HcaClaims;
	if (!claims?.sub) throw new Error('Hack Club Auth userinfo missing subject');
	return claims;
}

/**
 * Create or update the local user.
 *
 * `role` is deliberately absent from both the insert and the update: it is
 * owned by the database and can only be changed by an operator running SQL.
 * Nothing the identity provider or the browser says can escalate it.
 */
export async function upsertUser(claims: HcaClaims): Promise<UserRow> {
	const displayName =
		claims.name ?? claims.nickname ?? claims.given_name ?? claims.email?.split('@')[0] ?? null;

	const { data, error } = await db()
		.from('users')
		.upsert(
			{
				hackclub_id: claims.sub,
				email: claims.email ?? null,
				slack_id: claims.slack_id ?? null,
				display_name: displayName,
				avatar_url: claims.picture ?? null
			},
			{ onConflict: 'hackclub_id' }
		)
		.select('*')
		.single();

	if (error) throw new Error(`Could not sync user: ${error.message}`);
	return data as UserRow;
}
