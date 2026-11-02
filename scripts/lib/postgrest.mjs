// @ts-nocheck
import { createHmac } from 'node:crypto';
import { PostgrestClient } from '@supabase/postgrest-js';

/**
 * HS256 JWT for PostgREST. Keep in sync with src/lib/server/postgrest-jwt.ts.
 * The `role` claim is the database role PostgREST switches to.
 */
export const APP_ROLE = 'expedition';
export const JWT_TTL_SECONDS = 50 * 60;

export function signRoleJwt(secret, role = APP_ROLE, nowSeconds = Math.floor(Date.now() / 1000), ttl = JWT_TTL_SECONDS) {
	if (!secret || secret.length < 32) {
		throw new Error('POSTGREST_JWT_SECRET must be at least 32 characters');
	}
	if (secret.trimStart().startsWith('{')) {
		throw new Error('POSTGREST_JWT_SECRET must be a raw HMAC secret, not a JSON JWK');
	}
	const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
	const body = Buffer.from(JSON.stringify({ role, iat: nowSeconds, exp: nowSeconds + ttl })).toString('base64url');
	const data = `${header}.${body}`;
	const sig = createHmac('sha256', secret).update(data).digest('base64url');
	return `${data}.${sig}`;
}

export function createPostgrest(url, secret, role = process.env.POSTGREST_DB_ROLE || APP_ROLE) {
	if (!url) throw new Error('Missing POSTGREST_URL');
	return new PostgrestClient(url.replace(/\/+$/, ''), {
		headers: { Authorization: `Bearer ${signRoleJwt(secret, role)}` },
		schema: 'public'
	});
}
