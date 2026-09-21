import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from './env';
import type { Database } from './database.types';

/**
 * Service-role Supabase client.
 *
 * This bypasses RLS and must never be reachable from the browser. It lives
 * under `$lib/server/`, which SvelteKit refuses to import into client bundles.
 *
 * We are not using Supabase Auth — identity comes from Hack Club Auth — so
 * session persistence and token refresh are turned off.
 */
let client: SupabaseClient<Database> | null = null;

export function db(): SupabaseClient<Database> {
	if (!client) {
		client = createClient<Database>(config.supabase.url, config.supabase.serviceRoleKey, {
			auth: {
				persistSession: false,
				autoRefreshToken: false,
				detectSessionInUrl: false
			}
		});
	}
	return client;
}
