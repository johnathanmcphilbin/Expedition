import { PostgrestClient } from '@supabase/postgrest-js';
import { config } from './env';
import type { Database } from './database.types';
import { JWT_TTL_SECONDS, signRoleJwt } from './postgrest-jwt';

/**
 * Server-only PostgREST client.
 *
 * The query builder is the same one the app already uses (`.from()`, `.rpc()`,
 * embeds, upserts, counts). It talks to PostgREST in front of plain Postgres,
 * with a short-lived JWT whose `role` claim is `expedition` (BYPASSRLS — see
 * deploy/postgrest/roles.sql). The JWT secret never leaves the server.
 */
let client: PostgrestClient<Database> | null = null;
let refreshAt = 0;

function clientFor(secret: string, url: string): PostgrestClient<Database> {
	const token = signRoleJwt(secret, config.postgrest.dbRole);
	return new PostgrestClient<Database>(url, {
		headers: { Authorization: `Bearer ${token}` },
		schema: 'public'
	});
}

export function db(): PostgrestClient<Database> {
	const now = Date.now();
	if (!client || now >= refreshAt) {
		client = clientFor(config.postgrest.jwtSecret, config.postgrest.url);
		refreshAt = now + (JWT_TTL_SECONDS - 60) * 1000;
	}
	return client;
}

/** Fetch against PostgREST with the same JWT the query builder uses. */
export function postgrestFetch(path: string, init: RequestInit = {}): Promise<Response> {
	const headers = new Headers(init.headers);
	const secret = config.postgrest.jwtSecret;
	headers.set('Authorization', `Bearer ${signRoleJwt(secret, config.postgrest.dbRole)}`);
	const url = `${config.postgrest.url}${path.startsWith('/') ? '' : '/'}${path}`;
	return fetch(url, { ...init, headers });
}
