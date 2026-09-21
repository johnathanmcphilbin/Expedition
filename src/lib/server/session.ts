import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { db } from './supabase';
import type { UserRow } from './database.types';

/**
 * Opaque, server-side sessions.
 *
 * The cookie carries a random 256-bit token. Only its SHA-256 hash is stored,
 * so a database leak does not hand an attacker live sessions. Sessions are
 * revocable (logout deletes the row) — unlike a signed stateless cookie.
 */

const COOKIE = 'expedition_session';
const TTL_DAYS = 30;

function hash(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

const cookieOptions = {
	path: '/',
	httpOnly: true,
	sameSite: 'lax' as const,
	secure: process.env.NODE_ENV === 'production',
	maxAge: TTL_DAYS * 24 * 60 * 60
};

export async function createSession(
	cookies: Cookies,
	userId: string,
	meta: { userAgent?: string | null; ip?: string | null } = {}
): Promise<void> {
	const token = randomBytes(32).toString('base64url');
	const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);

	const { error } = await db()
		.from('sessions')
		.insert({
			token_hash: hash(token),
			user_id: userId,
			expires_at: expiresAt.toISOString(),
			user_agent: meta.userAgent?.slice(0, 500) ?? null,
			ip: meta.ip ?? null
		});

	if (error) throw new Error(`Could not create session: ${error.message}`);

	cookies.set(COOKIE, token, cookieOptions);
}

/** Resolve the current user, or null. Expired sessions are cleaned up. */
export async function readSession(cookies: Cookies): Promise<UserRow | null> {
	const token = cookies.get(COOKIE);
	if (!token) return null;

	const { data, error } = await db()
		.from('sessions')
		.select('expires_at, users(*)')
		.eq('token_hash', hash(token))
		.maybeSingle();

	if (error || !data) return null;

	if (new Date(data.expires_at).getTime() < Date.now()) {
		await destroySession(cookies);
		return null;
	}

	// PostgREST returns the embedded row as an object for a to-one relationship
	const user = (data as unknown as { users: UserRow | null }).users;
	return user ?? null;
}

export async function destroySession(cookies: Cookies): Promise<void> {
	const token = cookies.get(COOKIE);
	if (token) {
		await db().from('sessions').delete().eq('token_hash', hash(token));
	}
	cookies.delete(COOKIE, { path: '/' });
}

/**
 * OAuth `state` / PKCE-style transient values, stored in short-lived cookies.
 * Hack Club Auth does not advertise PKCE, so `state` is our CSRF defence.
 */
const oauthCookieOptions = {
	path: '/',
	httpOnly: true,
	sameSite: 'lax' as const,
	secure: process.env.NODE_ENV === 'production',
	maxAge: 10 * 60
};

export function setOAuthState(cookies: Cookies, name: string, value: string): void {
	cookies.set(`oauth_${name}`, value, oauthCookieOptions);
}

/** Constant-time comparison, then single-use consumption of the cookie. */
export function consumeOAuthState(cookies: Cookies, name: string, received: string): boolean {
	const key = `oauth_${name}`;
	const expected = cookies.get(key);
	cookies.delete(key, { path: '/' });

	if (!expected || !received) return false;
	const a = Buffer.from(expected);
	const b = Buffer.from(received);
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

export function newStateToken(): string {
	return randomBytes(24).toString('base64url');
}
