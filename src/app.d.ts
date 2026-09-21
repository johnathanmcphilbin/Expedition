import type { UserRow } from '$lib/server/database.types';

// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			/** Current user, resolved from the session cookie in hooks.server.ts. */
			user: UserRow | null;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
