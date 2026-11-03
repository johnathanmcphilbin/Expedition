import { createHmac } from 'node:crypto';

/**
 * HS256 JWT for PostgREST. The `role` claim is the database role PostgREST
 * switches to. Keep this in sync with scripts/lib/postgrest.mjs.
 */
export const APP_ROLE = 'expedition';
export const JWT_TTL_SECONDS = 50 * 60;
/** Message for the derived secret. Keep in sync with scripts/lib/postgrest.mjs. */
export const JWT_DERIVE_LABEL = 'expedition-postgrest-jwt-v1';

/** Password libpq will send. `URL.password` is still percent-encoded. */
export function passwordFromDatabaseUrl(connectionString: string): string {
	let url: URL;
	try {
		url = new URL(connectionString);
	} catch {
		throw new Error('DATABASE_URL is not a valid URL, so the JWT secret cannot be derived');
	}
	if (!url.password) throw new Error('DATABASE_URL has no password, so the JWT secret cannot be derived');
	let password: string;
	try {
		password = decodeURIComponent(url.password);
	} catch {
		throw new Error('DATABASE_URL password is not valid percent-encoding');
	}
	if (!password) throw new Error('DATABASE_URL has no password, so the JWT secret cannot be derived');
	return password;
}

/** Hex HMAC-SHA256 of JWT_DERIVE_LABEL, keyed with the database password. */
export function deriveJwtSecret(connectionString: string): string {
	const password = passwordFromDatabaseUrl(connectionString);
	return createHmac('sha256', password).update(JWT_DERIVE_LABEL).digest('hex');
}

/**
 * An explicit POSTGREST_JWT_SECRET or PGRST_JWT_SECRET wins.
 * Otherwise derive from DATABASE_URL or PGRST_DB_URI.
 */
export function resolveJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
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

export function signRoleJwt(
	secret: string,
	role = APP_ROLE,
	nowSeconds = Math.floor(Date.now() / 1000),
	ttl = JWT_TTL_SECONDS
): string {
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
