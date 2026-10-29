import { db } from './supabase';
import type { ConnectedProject } from './stats';

export type Stage = 'building' | 'waiting' | 'changes' | 'approved' | 'rejected';
export type ProjectStage = { stage: Stage; approved: number | null; link: string | null };

export const stageKey = (userId: string, project: string) => `${userId}\u0000${project.toLowerCase()}`;

/**
 * Where each connected project is at, by stageKey: a waiting/decided queued
 * submission is the newest word, then an Expedition review, then a bare Hack
 * Club submission. Anything missing is still being built (never submitted).
 */
export async function projectStages(rows: ConnectedProject[]): Promise<Map<string, ProjectStage>> {
	const [reviews, queued, hcSubs] = await Promise.all([
		db().from('submission_reviews').select('user_id, hackatime_project, hackatime_projects, status, approved_hours, airtable_record_id'),
		db().from('submission_queue').select('id, user_id, project_name, hackatime_projects, status, created_at').neq('status', 'sent'),
		db().from('hackclub_submissions').select('user_id, project_names_raw, airtable_record_id')
	]);
	const key = stageKey;

	// where each project is at: a waiting/decided queued submission is the
	// newest word, then an Expedition review, then a bare Hack Club submission
	const stage = new Map<string, { stage: Stage; approved: number | null; link: string | null }>();
	for (const s of hcSubs.data ?? []) {
		if (!s.user_id || !s.project_names_raw) continue;
		for (const p of rows.filter((r) => r.userId === s.user_id)) {
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
	return stage;
}
