import { db } from './supabase';
import { reviewerName } from './guards';
import type { UserRow } from './database.types';

/**
 * Reviewer stats for the queue's Stats tab: what's waiting, how reviewing is
 * going, and a leaderboard. Decisions come from review_decisions, one row per
 * decision (every round counts, not just each submission's latest).
 */

export type Decision = 'approved' | 'changes_requested' | 'rejected';

/** Record a decision. Never fails the review itself: stats are a nice-to-have. */
export async function logDecision(params: {
	kind: 'hc' | 'new';
	key: string;
	reviewerId: string;
	decision: Decision;
	approvedHours: number | null;
	trackedHours: number | null;
	hardware?: boolean;
	/** when this round started waiting for a reviewer */
	waitingSince?: string | null;
}): Promise<void> {
	try {
		let hardware = params.hardware;
		if (hardware === undefined) {
			const { data } = await db().from('submission_queue').select('hardware').eq('airtable_record_id', params.key).maybeSingle();
			hardware = data?.hardware ?? false;
		}
		const row = {
			item_kind: params.kind,
			item_key: params.key,
			reviewer_id: params.reviewerId,
			decision: params.decision,
			approved_hours: params.decision === 'approved' ? params.approvedHours : null,
			tracked_hours: params.trackedHours === null ? null : Math.round(params.trackedHours * 100) / 100,
			hardware
		};
		const waited = params.waitingSince ? (Date.now() - new Date(params.waitingSince).getTime()) / 3_600_000 : null;
		let { error } = await db()
			.from('review_decisions')
			.insert({ ...row, waited_hours: waited !== null && waited >= 0 ? Math.round(waited * 100) / 100 : null });
		// before the wait-times migration: log it without the wait
		if (error?.message.includes('waited_hours')) ({ error } = await db().from('review_decisions').insert(row));
		if (error) console.error('logDecision', error.message);
	} catch (e) {
		console.error('logDecision', e);
	}
}

type QueueItem = { status: string; hardware: boolean; trackedHours: number | null; waitingSince: string | null; gone: boolean };

const r1 = (n: number) => Math.round(n * 10) / 10;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function reviewStats(items: QueueItem[], viewerId: string) {
	const rows: { reviewer_id: string | null; decision: Decision; approved_hours: number | null; tracked_hours: number | null; hardware: boolean; decided_at: string; waited_hours?: number | null }[] = [];
	// waited_hours only once the wait-times migration is in
	let cols = 'reviewer_id, decision, approved_hours, tracked_hours, hardware, decided_at, waited_hours';
	for (let from = 0; ; from += 1000) {
		let { data, error } = await db().from('review_decisions').select(cols).range(from, from + 999);
		if (error?.message.includes('waited_hours')) {
			cols = 'reviewer_id, decision, approved_hours, tracked_hours, hardware, decided_at';
			({ data, error } = await db().from('review_decisions').select(cols).range(from, from + 999));
		}
		if (error) throw new Error(error.message);
		rows.push(...((data ?? []) as unknown as typeof rows));
		if (!data || data.length < 1000) break;
	}

	// ---- the queue right now
	const waiting = items.filter((i) => (i.status === 'pending' || i.status === 'in_review') && !i.gone);
	// since it last entered the queue: time spent on changes doesn't count
	const oldest = waiting.reduce<string | null>((o, i) => (i.waitingSince && (!o || i.waitingSince < o) ? i.waitingSince : o), null);
	const queue = {
		projects: waiting.length,
		software: waiting.filter((i) => !i.hardware).length,
		hardware: waiting.filter((i) => i.hardware).length,
		trackedHours: r1(waiting.reduce((t, i) => t + (i.trackedHours ?? 0), 0)),
		unknownHours: waiting.filter((i) => i.trackedHours === null).length,
		waitingOnBuilders: items.filter((i) => i.status === 'changes_requested').length,
		oldestDays: oldest ? r1((Date.now() - new Date(oldest).getTime()) / DAY_MS) : null
	};

	// ---- everyone's reviewing
	const weekAgo = new Date(Date.now() - 7 * DAY_MS).toISOString();
	const tally = (rs: typeof rows) => {
		const approved = rs.filter((r) => r.decision === 'approved');
		const both = approved.filter((r) => r.tracked_hours && r.approved_hours !== null);
		const tracked = both.reduce((t, r) => t + Number(r.tracked_hours), 0);
		return {
			reviews: rs.length,
			week: rs.filter((r) => r.decided_at >= weekAgo).length,
			approved: approved.length,
			changes: rs.filter((r) => r.decision === 'changes_requested').length,
			rejected: rs.filter((r) => r.decision === 'rejected').length,
			approvalRate: rs.length ? Math.round((approved.length / rs.length) * 100) : null,
			hoursApproved: r1(approved.reduce((t, r) => t + Number(r.approved_hours ?? 0), 0)),
			// share of tracked time not approved, where both are known
			cutPercent: tracked > 0 ? Math.round((1 - both.reduce((t, r) => t + Number(r.approved_hours), 0) / tracked) * 100) : null
		};
	};

	// how long a submission waits for a reviewer, per round, from entering the queue
	const waitOf = (rs: typeof rows) => {
		const w = rs.map((r) => r.waited_hours).filter((h): h is number => h !== null && h !== undefined).map(Number).sort((a, b) => a - b);
		if (!w.length) return null;
		const mid = Math.floor(w.length / 2);
		return {
			averageHours: r1(w.reduce((t, h) => t + h, 0) / w.length),
			medianHours: r1(w.length % 2 ? w[mid] : (w[mid - 1] + w[mid]) / 2),
			rounds: w.length
		};
	};
	const wait = { all: waitOf(rows), week: waitOf(rows.filter((r) => r.decided_at >= weekAgo)) };

	const ids = [...new Set(rows.map((r) => r.reviewer_id).filter((x): x is string => !!x))];
	const { data: people } = ids.length ? await db().from('users').select('*').in('id', ids) : { data: [] };
	const names = new Map(((people ?? []) as UserRow[]).map((u) => [u.id, reviewerName(u)]));
	const leaderboard = ids
		.map((id) => ({ id, name: names.get(id) ?? 'Former reviewer', me: id === viewerId, ...tally(rows.filter((r) => r.reviewer_id === id)) }))
		.sort((a, b) => b.reviews - a.reviews || b.hoursApproved - a.hoursApproved);

	// ---- decisions per day, last 14 days (UTC)
	const days = Array.from({ length: 14 }, (_, i) => new Date(Date.now() - (13 - i) * DAY_MS).toISOString().slice(0, 10));
	const perDay = days.map((day) => {
		const d = rows.filter((r) => r.decided_at.slice(0, 10) === day);
		return { day, approved: d.filter((r) => r.decision === 'approved').length, other: d.filter((r) => r.decision !== 'approved').length };
	});

	return { queue, wait, totals: tally(rows), hardware: tally(rows.filter((r) => r.hardware)), software: tally(rows.filter((r) => !r.hardware)), leaderboard, perDay };
}
