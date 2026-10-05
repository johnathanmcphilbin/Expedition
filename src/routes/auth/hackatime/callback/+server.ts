import { redirect, type RequestHandler } from '@sveltejs/kit';
import { exchangeCode, fetchHackatimeUserId, saveConnection, hackatimeLinkedElsewhere } from '$lib/server/hackatime';
import { consumeOAuthState, safeNext } from '$lib/server/session';
import { callbackUrl } from '$lib/server/env';
import { requireUser } from '$lib/server/guards';

export const GET: RequestHandler = async ({ url, cookies, locals }) => {
	// The connection belongs to the logged-in user, taken from the session —
	// never from anything in the callback URL.
	const user = requireUser(locals, '/dashboard');

	const next = safeNext(cookies.get('oauth_ht_next'));
	cookies.delete('oauth_ht_next', { path: '/' });
	const dest = next ?? '/dashboard';

	if (url.searchParams.get('error')) redirect(303, `${dest}?hackatime=denied`);

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state') ?? '';
	if (!code || !consumeOAuthState(cookies, 'ht_state', state)) {
		redirect(303, `${dest}?hackatime=failed`);
	}

	const tokens = await exchangeCode(code, callbackUrl(url.origin, '/auth/hackatime/callback'));
	const hackatimeUserId = await fetchHackatimeUserId(tokens.access_token!);
	// one Expedition account per Hackatime account, or the same tracked
	// hours could be submitted and approved once per account
	if (hackatimeUserId && (await hackatimeLinkedElsewhere(hackatimeUserId, user.id))) {
		redirect(303, `${dest}?hackatime=taken`);
	}
	await saveConnection(user.id, tokens, hackatimeUserId);

	redirect(303, `${dest}?hackatime=connected`);
};
