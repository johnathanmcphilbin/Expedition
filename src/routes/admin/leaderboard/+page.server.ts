import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/guards';
import { db } from '$lib/server/supabase';
import { getConnectedProjects } from '$lib/server/stats';

/**
 * Hours leaderboard, admin-only while it's being tweaked. Approved hours are
 * the journey hours from user_expedition_progress (approved builds plus
 * referral credit); tracked hours are live Hackatime time on the projects
 * they've connected to Expedition. Real accounts only.
 */
export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);

	const [connected, users, progress] = await Promise.all([
		getConnectedProjects(),
		db().from('users').select('id, display_name, slack_id').like('hackclub_id', 'ident!%'),
		db().from('user_expedition_progress').select('user_id, hours_earned').gt('hours_earned', 0)
	]);

	const tracked = new Map<string, { seconds: number; projects: number }>();
	for (const r of connected.rows) {
		const t = tracked.get(r.userId) ?? { seconds: 0, projects: 0 };
		t.seconds += r.seconds ?? 0;
		t.projects++;
		tracked.set(r.userId, t);
	}
	const approved = new Map((progress.data ?? []).map((p) => [p.user_id as string, Number(p.hours_earned)]));

	const round1 = (n: number) => Math.round(n * 10) / 10;
	const rows = (users.data ?? [])
		.map((u) => ({
			id: u.id,
			name: u.display_name ?? 'Unknown',
			slackId: u.slack_id,
			approved: round1(approved.get(u.id) ?? 0),
			tracked: round1((tracked.get(u.id)?.seconds ?? 0) / 3600),
			projects: tracked.get(u.id)?.projects ?? 0
		}))
		.filter((r) => r.approved > 0 || r.tracked > 0);

	return { rows, checkedAt: connected.checkedAt };
};
