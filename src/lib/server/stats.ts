import { db } from './supabase';
import { fetchProjectTimes } from './hackatime';

/**
 * Admin-only numbers about what's happening across Expedition right now.
 *
 * "Connected" projects are the Hackatime projects builders picked as ones
 * they're working on (expedition_projects), which also includes everything
 * they've submitted. Activity comes from each builder's own Hackatime
 * (last heartbeat per project), fetched live and reused for a couple of
 * minutes so reloading the admin page doesn't hit Hackatime every time.
 */

export type ActivityStats = {
	connectedProjects: number;
	builders: number;
	activeNow: number;
	active24h: number;
	active7d: number;
	trackedHours: number;
	unreachable: number;
	working: { project: string; builder: string; lastBeat: string; tracked: number }[];
	checkedAt: string;
};

const TTL_MS = 2 * 60 * 1000;
let cache: { at: number; value: ActivityStats } | null = null;

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (next < items.length) {
				const i = next++;
				out[i] = await fn(items[i]);
			}
		})
	);
	return out;
}

export async function getActivityStats(): Promise<ActivityStats> {
	if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

	const { data, error } = await db()
		.from('expedition_projects')
		.select('user_id, hackatime_project, users(display_name)');
	if (error) throw new Error(error.message);
	const rows = (data ?? []) as unknown as {
		user_id: string;
		hackatime_project: string;
		users: { display_name: string | null } | null;
	}[];

	const byUser = new Map<string, { name: string; projects: string[] }>();
	for (const r of rows) {
		const u = byUser.get(r.user_id) ?? { name: (r.users?.display_name ?? 'Someone').split(' ')[0], projects: [] };
		u.projects.push(r.hackatime_project);
		byUser.set(r.user_id, u);
	}

	const now = Date.now();
	const MIN = 60 * 1000;
	let activeNow = 0;
	let active24h = 0;
	let active7d = 0;
	let trackedSeconds = 0;
	let unreachable = 0;
	const working: ActivityStats['working'] = [];

	const results = await mapLimit([...byUser.entries()], 8, async ([userId, u]) => ({
		u,
		times: await fetchProjectTimes(userId)
	}));

	for (const { u, times } of results) {
		if (!times) {
			unreachable++;
			continue;
		}
		for (const name of u.projects) {
			const t = times.find((p) => p.name === name);
			if (!t) continue;
			trackedSeconds += t.totalSeconds;
			if (!t.mostRecentHeartbeat) continue;
			const age = now - new Date(t.mostRecentHeartbeat).getTime();
			if (age <= 15 * MIN) activeNow++;
			if (age <= 24 * 60 * MIN) {
				active24h++;
				working.push({ project: name, builder: u.name, lastBeat: t.mostRecentHeartbeat, tracked: Math.round((t.totalSeconds / 3600) * 10) / 10 });
			}
			if (age <= 7 * 24 * 60 * MIN) active7d++;
		}
	}

	working.sort((a, b) => b.lastBeat.localeCompare(a.lastBeat));

	const value: ActivityStats = {
		connectedProjects: rows.length,
		builders: byUser.size,
		activeNow,
		active24h,
		active7d,
		trackedHours: Math.round(trackedSeconds / 360) / 10,
		unreachable,
		working: working.slice(0, 20),
		checkedAt: new Date().toISOString()
	};
	cache = { at: Date.now(), value };
	return value;
}

/** Cheap counts straight from the database. */
export async function getOverviewStats() {
	const count = async (table: string, build?: (q: any) => any) => {
		let q = db().from(table as any).select('*', { count: 'exact', head: true });
		if (build) q = build(q);
		const { count: n, error } = await q;
		return error ? null : (n ?? 0);
	};
	const [signedUp, hackatime, checkpoints, queued] = await Promise.all([
		count('users', (q) => q.like('hackclub_id', 'ident!%')),
		count('hackatime_connections'),
		count('checkpoints'),
		count('submission_queue', (q) => q.neq('status', 'sent'))
	]);
	return { signedUp, hackatime, checkpoints, queued };
}
