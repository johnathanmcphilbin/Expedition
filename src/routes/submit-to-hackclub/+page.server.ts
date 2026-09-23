import type { PageServerLoad } from './$types';
import { requireUser } from '$lib/server/guards';
import { listProjects } from '$lib/server/queries';

/**
 * Hack Club's Unified YSWS submission — a separate, one-time thing per
 * project from Expedition's own checkpoint system. It goes straight to
 * Hack Club's own review/shipping pipeline; nothing here reads its status
 * back or touches this app's ledger. See docs/backend.md for why.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals, '/submit-to-hackclub');
	const projects = await listProjects(user.id);

	// Just restores a picked project across reloads — an unrecognised or
	// malformed id simply means nothing is pre-selected, not a 500.
	const requestedId = url.searchParams.get('project');
	const selected = projects.find((p) => p.id === requestedId) ?? null;

	return { projects, selected };
};
