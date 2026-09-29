import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/guards';
import { db } from '$lib/server/supabase';
import { getConnectedProjects } from '$lib/server/stats';
import { unlockedCount } from '$lib/server/checkpoints';

type Stage = 'building' | 'waiting' | 'changes' | 'approved' | 'rejected';

/** Every Hackatime project connected to Expedition, with its hours and where it's at. */
export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);

	const [connected, reviews, queued, hcSubs, checkpoints] = await Promise.all([
		getConnectedProjects(),
		db().from('submission_reviews').select('user_id, hackatime_project, hackatime_projects, status, approved_hours, airtable_record_id'),
		db().from('submission_queue').select('id, user_id, project_name, hackatime_projects, status, created_at, email').neq('status', 'sent'),
		db().from('hackclub_submissions').select('user_id, project_names_raw, airtable_record_id, email'),
		db().from('checkpoints').select('user_id, hackatime_project')
	]);

	const key = (userId: string, project: string) => `${userId}\u0000${project.toLowerCase()}`;

	// where each project is at: a waiting/decided queued submission is the
	// newest word, then an Expedition review, then a bare Hack Club submission
	const stage = new Map<string, { stage: Stage; approved: number | null; link: string | null }>();
	for (const s of hcSubs.data ?? []) {
		if (!s.user_id || !s.project_names_raw) continue;
		for (const p of connected.rows.filter((r) => r.userId === s.user_id)) {
			if (s.project_names_raw.toLowerCase().includes(p.project.toLowerCase())) {
				stage.set(key(p.userId, p.project), { stage: 'waiting', approved: null, link: `/admin/reviews?status=all&submission=${s.airtable_record_id}` });
			}
		}
	}
	const reviewStage: Record<string, Stage> = { pending: 'waiting', in_review: 'waiting', changes_requested: 'changes', approved: 'approved', rejected: 'rejected' };
	for (const r of reviews.data ?? []) {
		const names = (r.hackatime_projects as string[] | null)?.length ? (r.hackatime_projects as string[]) : [r.hackatime_project as string];
		for (const n of names) {
			stage.set(key(r.user_id, n), {
				stage: reviewStage[r.status as string] ?? 'waiting',
				approved: r.approved_hours === null ? null : Number(r.approved_hours),
				link: `/admin/reviews?status=all&submission=${r.airtable_record_id}`
			});
		}
	}
	const queueStage: Record<string, Stage> = { pending: 'waiting', changes_requested: 'changes', rejected: 'rejected' };
	const newestFirst = [...(queued.data ?? [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
	for (const q of newestFirst) {
		const names = (q.hackatime_projects as string[] | null)?.length ? (q.hackatime_projects as string[]) : [q.project_name as string];
		for (const n of names) {
			stage.set(key(q.user_id, n), { stage: queueStage[q.status as string] ?? 'waiting', approved: null, link: `/admin/reviews?status=all&new=${q.id}` });
		}
	}

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
