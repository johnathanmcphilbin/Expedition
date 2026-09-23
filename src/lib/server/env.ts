import { env } from '$env/dynamic/private';

/**
 * Server-only configuration.
 *
 * Everything here is read from `$env/dynamic/private`, which SvelteKit refuses
 * to bundle into client code — importing this module from a `.svelte` file is a
 * build error rather than a silent secret leak.
 */

function required(name: string): string {
	const value = env[name];
	if (!value) {
		// Never interpolate the value, only the name.
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

export const config = {
	supabase: {
		get url() {
			return required('SUPABASE_URL');
		},
		get serviceRoleKey() {
			return required('SUPABASE_SERVICE_ROLE_KEY');
		}
	},

	/** Hack Club Auth — the identity provider. */
	hca: {
		issuer: 'https://auth.hackclub.com',
		authorizeUrl: 'https://auth.hackclub.com/oauth/authorize',
		tokenUrl: 'https://auth.hackclub.com/oauth/token',
		userinfoUrl: 'https://auth.hackclub.com/oauth/userinfo',
		get clientId() {
			return required('HCA_CLIENT_ID');
		},
		get clientSecret() {
			return required('HCA_CLIENT_SECRET');
		},
		/**
		 * Only what the issuer advertises in `scopes_supported`: openid, profile,
		 * phone, birthdate. `email` and `slack_id` are NOT scopes here — they are
		 * claims, returned under `profile`. Requesting them as scopes gets the
		 * whole authorization rejected with `invalid_scope`.
		 */
		scope: 'openid profile'
	},

	/** Hackatime — coding-time evidence only, never an awarder of hours. */
	hackatime: {
		baseUrl: 'https://hackatime.hackclub.com',
		authorizeUrl: 'https://hackatime.hackclub.com/oauth/authorize',
		tokenUrl: 'https://hackatime.hackclub.com/oauth/token',
		apiUrl: 'https://hackatime.hackclub.com/api/v1',
		get clientId() {
			return required('HACKATIME_CLIENT_ID');
		},
		get clientSecret() {
			return required('HACKATIME_CLIENT_SECRET');
		},
		/** Deliberately minimal. Never request admin. */
		scope: 'profile read'
	},

	/**
	 * Hack Club's Unified YSWS Airtable base — the source of truth for whether
	 * a project has been submitted. Expedition reads from it and writes its own
	 * review decisions into a separate table Expedition owns; it never writes
	 * into Hack Club's own submission fields.
	 */
	airtable: {
		baseId: 'appGcYrt3CFYab05y',
		// "YSWS Project Submission" — Hack Club's own table. Read AND written:
		// Expedition's review answer is filled directly into the
		// "Expedition …" fields on the submission row itself, not into a
		// separate table — that's where this org already looks.
		submissionTableId: 'tblfwLewpflB3hH1Y',
		get apiKey() {
			return required('AIRTABLE_API_KEY');
		}
	}
};

/**
 * Absolute callback URL for an OAuth `redirect_uri`.
 *
 * Providers match this byte-for-byte against what is registered, so in
 * production we do not trust the request origin: behind a TLS-terminating
 * proxy it arrives as `http://` or as an internal hostname, and either is a
 * mismatch. `APP_ORIGIN` pins it. Left unset in dev, the request origin
 * (http://localhost:5175) is used instead.
 */
export function callbackUrl(origin: string, path: string): string {
	return new URL(path, publicOrigin() ?? origin).toString();
}

/**
 * The origin to build callbacks from, or null to fall back to the request.
 *
 * `APP_ORIGIN` is the canonical knob. `HCA_REDIRECT_URI` is accepted as a
 * second source because it is natural to configure the full registered
 * callback rather than a bare origin; we take its origin so that Hackatime's
 * callback is derived consistently from the same host.
 */
function publicOrigin(): string | null {
	const explicit = env.APP_ORIGIN?.trim();
	if (explicit) return explicit.replace(/\/+$/, '');

	const registered = env.HCA_REDIRECT_URI?.trim();
	if (registered) {
		try {
			return new URL(registered).origin;
		} catch {
			throw new Error('HCA_REDIRECT_URI is not a valid absolute URL');
		}
	}

	return null;
}
