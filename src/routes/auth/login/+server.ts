import { redirect, type RequestHandler } from '@sveltejs/kit';
import { authorizeUrl } from '$lib/server/hca';
import { newStateToken, setOAuthState, safeNext } from '$lib/server/session';
import { callbackUrl } from '$lib/server/env';

export const GET: RequestHandler = ({ url, cookies }) => {
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
