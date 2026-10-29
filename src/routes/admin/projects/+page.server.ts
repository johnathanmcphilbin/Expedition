import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/guards';
import { db } from '$lib/server/supabase';
import { getConnectedProjects } from '$lib/server/stats';
import { unlockedCount } from '$lib/server/checkpoints';
import { projectStages, stageKey, type Stage } from '$lib/server/project-stages';


/** Every Hackatime project connected to Expedition, with its hours and where it's at. */
export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);

	const [connected, queued, hcSubs, checkpoints] = await Promise.all([
		getConnectedProjects(),
		db().from('submission_queue').select('user_id, email').neq('status', 'sent'),
		db().from('hackclub_submissions').select('user_id, email'),
		db().from('checkpoints').select('user_id, hackatime_project')
	]);

	const stage = await projectStages(connected.rows);
	const key = stageKey;

	// an email they typed on a submission, used when their account has none
	const typedEmail = new Map<string, string>();
	for (const s of [...(hcSubs.data ?? []), ...(queued.data ?? [])]) {
		if (s.user_id && s.email) typedEmail.set(s.user_id as string, s.email as string);
	}

	const posted = new Map<string, number>();
	for (const c of checkpoints.data ?? []) {
		const k = key(c.user_id, c.hackatime_project);
		posted.set(k, (posted.get(k) ?? 0) + 1);
	}

	return {
		checkedAt: connected.checkedAt,
		projects: connected.rows.map((r) => {
			const s = stage.get(key(r.userId, r.project));
			const hours = r.seconds === null ? null : Math.round((r.seconds / 3600) * 10) / 10;
			return {
				id: key(r.userId, r.project),
				project: r.project,
				builder: r.builder,
				email: typedEmail.get(r.userId) ?? r.email,
				hours,
				languages: r.languages,
				lastBeat: r.lastBeat,
				reachable: r.reachable,
				stage: s?.stage ?? ('building' as Stage),
				approved: s?.approved ?? null,
				link: s?.link ?? null,
				checkpoints: posted.get(key(r.userId, r.project)) ?? 0,
				checkpointsUnlocked: r.seconds === null ? 0 : unlockedCount(r.seconds / 3600)
			};
		})
	};
};
