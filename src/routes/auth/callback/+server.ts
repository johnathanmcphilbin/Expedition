import { redirect, type RequestHandler } from '@sveltejs/kit';
import { exchangeCode, fetchClaims, upsertUser } from '$lib/server/hca';
import { consumeOAuthState, createSession, safeNext } from '$lib/server/session';
import { callbackUrl } from '$lib/server/env';
import { connectionStatus } from '$lib/server/hackatime';
import { attachReferralOnSignup } from '$lib/server/referrals';
import { recordOrigin } from '$lib/server/origins';

export const GET: RequestHandler = async ({ url, cookies, request, getClientAddress }) => {
	const error = url.searchParams.get('error');
	if (error) redirect(303, '/?auth=denied');

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state') ?? '';

	// Validate state before doing anything with the code (CSRF defence).
	if (!code || !consumeOAuthState(cookies, 'hca_state', state)) {
		redirect(303, '/?auth=failed');
	}

	const next = safeNext(cookies.get('oauth_hca_next'));
	cookies.delete('oauth_hca_next', { path: '/' });

	const accessToken = await exchangeCode(code, callbackUrl(url.origin, '/auth/callback'));
	const claims = await fetchClaims(accessToken);
	const { user, created } = await upsertUser(claims);
	// someone new to Expedition: attach the referral link they came through, if any
	if (created) await attachReferralOnSignup(cookies, user);
	// a Hack Club address gives us their nearest airport straight away (only the airport is kept for travel)
	if (user.hca_address?.locality && user.hca_address.country) {
		await recordOrigin(user.id, { city: user.hca_address.locality, state: user.hca_address.region ?? null, country: user.hca_address.country }).catch(
			(e) => console.error('recordOrigin at sign-in', e)
		);
	}

	await createSession(cookies, user.id, {
		userAgent: request.headers.get('user-agent'),
		ip: getClientAddress()
	});

	// Without Hackatime connected there is nothing to show on the dashboard —
	// walk them through connecting it first, even if `next` pointed somewhere
	// else. Anyone already connected goes straight where they were headed.
	let hackatime: Awaited<ReturnType<typeof connectionStatus>>;
	try {
		hackatime = await connectionStatus(user.id);
	} catch {
		// Auth and the local session are already complete. A temporary status
		// lookup failure must not turn a successful sign-in into a 500.
		redirect(303, next ?? '/dashboard');
	}
	if (!hackatime.connected) {
		redirect(303, '/onboarding');
	}

	redirect(303, next ?? '/dashboard');
};
