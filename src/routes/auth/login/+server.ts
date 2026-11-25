import { error, redirect, type RequestHandler } from '@sveltejs/kit';
import { authorizeUrl } from '$lib/server/hca';
import { newStateToken, setOAuthState, safeNext } from '$lib/server/session';
import { callbackUrl, config } from '$lib/server/env';

export const GET: RequestHandler = ({ url, cookies }) => {
	if (!config.hca.configured) {
		error(503, 'Sign-in is not configured in this local environment. Add HCA_CLIENT_ID and HCA_CLIENT_SECRET to .env.');
	}

	const state = newStateToken();
	setOAuthState(cookies, 'hca_state', state);

	// Remember where to land afterwards, but only same-site paths — an
	// attacker-supplied absolute URL here would be an open redirect.
	const next = safeNext(url.searchParams.get('next'));
	if (next) {
		setOAuthState(cookies, 'hca_next', next);
	}

	redirect(303, authorizeUrl(callbackUrl(url.origin, '/auth/callback'), state));
};
