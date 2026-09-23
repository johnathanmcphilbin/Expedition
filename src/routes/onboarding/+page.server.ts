import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireUser } from '$lib/server/guards';
import { connectionStatus } from '$lib/server/hackatime';

/**
 * Onboarding is just "connect Hackatime" — Hack Club Auth is already done by
 * the time anyone lands here. There is no project to create: the dashboard
 * shows Hackatime projects live, and Hack Club's own submission is the only
 * submission. Once Hackatime is connected, later logins skip straight past
 * this (see auth/callback).
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals, '/onboarding');

	const hackatime = await connectionStatus(user.id);
	if (hackatime.connected) {
		redirect(303, '/dashboard');
	}

	return { flash: url.searchParams.get('hackatime') };
};
