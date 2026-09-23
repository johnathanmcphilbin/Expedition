import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireUser } from '$lib/server/guards';
import { connectionStatus, fetchProjectTimes, formatHours } from '$lib/server/hackatime';

/**
 * The one place a participant submits a project — Hack Club's own Unified
 * YSWS form, embedded with their Hackatime ID and chosen project prefilled.
 * There is no Expedition-specific submission here; the resulting Airtable
 * row is what the admin review queue picks up (see src/lib/server/airtable.ts).
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals, '/submit-to-hackclub');

	const hackatime = await connectionStatus(user.id);
	if (!hackatime.connected) {
		redirect(303, '/auth/hackatime?next=/submit-to-hackclub');
	}

	const times = await fetchProjectTimes(user.id);
	const projects = (times ?? [])
		.filter((t) => !t.archived)
		.map((t) => ({ name: t.name, tracked: formatHours(t.totalSeconds) }));

	const requestedName = url.searchParams.get('project');
	const selected = projects.find((p) => p.name === requestedName) ?? null;

	return {
		hackatimeUserId: hackatime.hackatimeUserId,
		hackatimeUnavailable: times === null,
		projects,
		selected
	};
};
