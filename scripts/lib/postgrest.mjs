// @ts-nocheck
import { createHmac } from 'node:crypto';
import { PostgrestClient } from '@supabase/postgrest-js';

/**
 * HS256 JWT for PostgREST. Keep in sync with src/lib/server/postgrest-jwt.ts.
 * The `role` claim is the database role PostgREST switches to.
 */
export const APP_ROLE = 'expedition';
export const JWT_TTL_SECONDS = 50 * 60;
/** Message for the derived secret. Keep in sync with deploy/postgrest/derive-jwt-secret.sh. */
export const JWT_DERIVE_LABEL = 'expedition-postgrest-jwt-v1';

/**
 * Password libpq will actually send. `URL.password` is still percent-encoded;
 * decode once, the same way the shell helper does.
 */
export function passwordFromDatabaseUrl(connectionString) {
	let url;
	try {
		url = new URL(connectionString);
	} catch {
		throw new Error('DATABASE_URL is not a valid URL, so the JWT secret cannot be derived');
	}
	if (!url.password) throw new Error('DATABASE_URL has no password, so the JWT secret cannot be derived');
	let password;
	try {
		password = decodeURIComponent(url.password);
	} catch {
		throw new Error('DATABASE_URL password is not valid percent-encoding');
	}
	if (!password) throw new Error('DATABASE_URL has no password, so the JWT secret cannot be derived');
	return password;
}

/** Hex HMAC-SHA256 of JWT_DERIVE_LABEL, keyed with the database password. */
export function deriveJwtSecret(connectionString) {
	const password = passwordFromDatabaseUrl(connectionString);
	return createHmac('sha256', password).update(JWT_DERIVE_LABEL).digest('hex');
}

/**
 * An explicit POSTGREST_JWT_SECRET or PGRST_JWT_SECRET wins.
 * Otherwise derive from DATABASE_URL or PGRST_DB_URI. The value is not logged.
 */
export function resolveJwtSecret(env = process.env) {
	const appSecret = env.POSTGREST_JWT_SECRET;
	const postgrestSecret = env.PGRST_JWT_SECRET;
	if (appSecret && postgrestSecret && appSecret !== postgrestSecret) {
		throw new Error('POSTGREST_JWT_SECRET and PGRST_JWT_SECRET are both set and differ');
	}
	if (appSecret || postgrestSecret) return appSecret || postgrestSecret;
	const url = env.DATABASE_URL || env.PGRST_DB_URI;
	if (!url) throw new Error('POSTGREST_JWT_SECRET is unset and DATABASE_URL is missing');
	return deriveJwtSecret(url);
}

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
