import { redirect, type RequestHandler } from '@sveltejs/kit';
import { exchangeCode, fetchClaims, upsertUser } from '$lib/server/hca';
import { consumeOAuthState, createSession } from '$lib/server/session';
import { callbackUrl } from '$lib/server/env';
import { connectionStatus } from '$lib/server/hackatime';

export const GET: RequestHandler = async ({ url, cookies, request, getClientAddress }) => {
	const error = url.searchParams.get('error');
	if (error) redirect(303, '/?auth=denied');

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state') ?? '';

	// Validate state before doing anything with the code (CSRF defence).
	if (!code || !consumeOAuthState(cookies, 'hca_state', state)) {
		redirect(303, '/?auth=failed');
	}

	const next = cookies.get('oauth_hca_next');
	cookies.delete('oauth_hca_next', { path: '/' });

	const accessToken = await exchangeCode(code, callbackUrl(url.origin, '/auth/callback'));
	const claims = await fetchClaims(accessToken);
	const user = await upsertUser(claims);

	await createSession(cookies, user.id, {
		userAgent: request.headers.get('user-agent'),
		ip: getClientAddress()
	});

	// Without Hackatime connected there is nothing to show on the dashboard —
	// walk them through connecting it first, even if `next` pointed somewhere
	// else. Anyone already connected goes straight where they were headed.
	const hackatime = await connectionStatus(user.id);
	if (!hackatime.connected) {
		redirect(303, '/onboarding');
	}

	redirect(303, next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');
};
