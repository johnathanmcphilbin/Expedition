import { db } from './supabase';
import { fetchProjectTimes, fetchHackatimeProfile } from './hackatime';

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

export type ConnectedProject = {
	userId: string;
	builder: string;
	/** from their Expedition account, else their Hackatime */
	email: string | null;
	project: string;
	seconds: number | null;
	languages: string[];
	lastBeat: string | null;
	/** false when this builder's Hackatime couldn't be reached */
	reachable: boolean;
};

let projectsCache: { at: number; value: { rows: ConnectedProject[]; checkedAt: string } } | null = null;

/**
 * Every connected project with its live Hackatime numbers. Shared by the
 * admin stats box and the projects list; cached for a couple of minutes.
 */
export async function getConnectedProjects(): Promise<{ rows: ConnectedProject[]; checkedAt: string }> {
	if (projectsCache && Date.now() - projectsCache.at < TTL_MS) return projectsCache.value;

	const { data, error } = await db()
		.from('expedition_projects')
		.select('user_id, hackatime_project, users(display_name, email)');
	if (error) throw new Error(error.message);
	const raw = (data ?? []) as unknown as {
		user_id: string;
		hackatime_project: string;
		users: { display_name: string | null; email: string | null } | null;
	}[];

	const byUser = new Map<string, { name: string; email: string | null; projects: string[] }>();
	for (const r of raw) {
		const u = byUser.get(r.user_id) ?? {
			name: r.users?.display_name ?? 'Unknown',
			email: r.users?.email ?? null,
			projects: []
		};
		u.projects.push(r.hackatime_project);
		byUser.set(r.user_id, u);
	}

	const results = await mapLimit([...byUser.entries()], 8, async ([userId, u]) => {
		const [times, profile] = await Promise.all([
			fetchProjectTimes(userId),
			u.email ? Promise.resolve(null) : fetchHackatimeProfile(userId)
		]);
		return { userId, u: { ...u, email: u.email ?? profile?.email ?? null }, times };
	});

	const rows: ConnectedProject[] = [];
	for (const { userId, u, times } of results) {
		for (const name of u.projects) {
			const t = times?.find((p) => p.name === name);
			rows.push({
				userId,
				builder: u.name,
				email: u.email,
				project: name,
				seconds: t ? t.totalSeconds : null,
				languages: t ? t.languages.slice(0, 3) : [],
				lastBeat: t?.mostRecentHeartbeat ?? null,
				reachable: times !== null
			});
		}
	}

	const value = { rows, checkedAt: new Date().toISOString() };
	projectsCache = { at: Date.now(), value };
	return value;
}

export async function getActivityStats(): Promise<ActivityStats> {
	const { rows, checkedAt } = await getConnectedProjects();

	const now = Date.now();
	const MIN = 60 * 1000;
	let activeNow = 0;
	let active24h = 0;
	let active7d = 0;
	let trackedSeconds = 0;
	const working: ActivityStats['working'] = [];

	for (const r of rows) {
		trackedSeconds += r.seconds ?? 0;
		if (!r.lastBeat) continue;
		const age = now - new Date(r.lastBeat).getTime();
		if (age <= 15 * MIN) activeNow++;
		if (age <= 24 * 60 * MIN) {
			active24h++;
			working.push({
				project: r.project,
				builder: r.builder.split(' ')[0],
				lastBeat: r.lastBeat,
				tracked: Math.round(((r.seconds ?? 0) / 3600) * 10) / 10
			});
		}
		if (age <= 7 * 24 * 60 * MIN) active7d++;
	}
	working.sort((a, b) => b.lastBeat.localeCompare(a.lastBeat));

	return {
		connectedProjects: rows.length,
		builders: new Set(rows.map((r) => r.userId)).size,
		activeNow,
		active24h,
		active7d,
		trackedHours: Math.round(trackedSeconds / 360) / 10,
		unreachable: new Set(rows.filter((r) => !r.reachable).map((r) => r.userId)).size,
		working: working.slice(0, 20),
		checkedAt
	};
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
