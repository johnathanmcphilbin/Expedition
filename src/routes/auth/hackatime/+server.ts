import { redirect, type RequestHandler } from '@sveltejs/kit';
import { authorizeUrl } from '$lib/server/hackatime';
import { newStateToken, setOAuthState } from '$lib/server/session';
import { callbackUrl } from '$lib/server/env';
import { requireUser } from '$lib/server/guards';

export const GET: RequestHandler = ({ url, cookies, locals }) => {
	requireUser(locals, '/dashboard');

	const state = newStateToken();
	setOAuthState(cookies, 'ht_state', state);

	redirect(303, authorizeUrl(callbackUrl(url.origin, '/auth/hackatime/callback'), state));
};
