import { estimateTrip } from '$lib/travel-estimates';
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

// ------------------------------------------------------------ analytics ----

const HOUR_MS = 3600 * 1000;
const median = (xs: number[]) => {
	if (!xs.length) return null;
	const s = [...xs].sort((a, b) => a - b);
	const m = Math.floor(s.length / 2);
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

const COUNTRY_ALIASES: Record<string, string> = {
	us: 'United States',
	usa: 'United States',
	'u.s.': 'United States',
	'u.s.a.': 'United States',
	'united states of america': 'United States',
	america: 'United States',
	uk: 'United Kingdom',
	'u.k.': 'United Kingdom',
	'great britain': 'United Kingdom',
	england: 'United Kingdom',
	scotland: 'United Kingdom',
	wales: 'United Kingdom',
	'northern ireland': 'United Kingdom',
	'republic of ireland': 'Ireland',
	eire: 'Ireland',
	in: 'India',
	ind: 'India',
	eg: 'Egypt',
	egy: 'Egypt',
	irl: 'Ireland',
	ie: 'Ireland',
	gbr: 'United Kingdom',
	gb: 'United Kingdom',
	can: 'Canada',
	mex: 'Mexico',
	mx: 'Mexico',
	méxico: 'Mexico',
	es: 'Spain',
	esp: 'Spain',
	españa: 'Spain',
	pe: 'Peru',
	per: 'Peru',
	perú: 'Peru',
	ro: 'Romania',
	rou: 'Romania',
	ca: 'Canada',
	de: 'Germany',
	deutschland: 'Germany',
	uae: 'United Arab Emirates',
	'u.a.e.': 'United Arab Emirates',
	korea: 'South Korea',
	'republic of korea': 'South Korea',
	'czech republic': 'Czechia',
	türkiye: 'Turkey',
	turkiye: 'Turkey',
	brasil: 'Brazil',
	'viet nam': 'Vietnam'
};

/** Free-text country → one consistent name, so "USA" and "United States" count together. */
function normaliseCountry(raw: string | null): string | null {
	const t = raw?.trim().replace(/\s+/g, ' ');
	if (!t) return null;
	const alias = COUNTRY_ALIASES[t.toLowerCase()];
	if (alias) return alias;
	if (t.length <= 3) return t.toUpperCase();
	// keep how they wrote it unless it's all one case
	if (t !== t.toLowerCase() && t !== t.toUpperCase()) return t;
	return t
		.toLowerCase()
		.split(' ')
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');
}

/**
 * Admin analytics: the sign-up funnel, how fast reviews happen, and where
 * hours end up. Spans both review systems (submissions already in Hack
 * Club's Airtable, and ones still in Expedition's own queue) without
 * counting a sent queued submission twice.
 */
export async function getReviewAnalytics() {
	const [users, connections, projects, hcSubs, queue, reviews, progress, reviewers, hcCountries, queueCountries] = await Promise.all([
		db().from('users').select('id').like('hackclub_id', 'ident!%'),
		db().from('hackatime_connections').select('user_id'),
		db().from('expedition_projects').select('user_id'),
		db().from('hackclub_submissions').select('airtable_record_id, user_id, airtable_created_at'),
		db().from('submission_queue').select('id, user_id, hardware, status, created_at, reviewed_at, reviewer_id, airtable_record_id'),
		db().from('submission_reviews').select('airtable_record_id, status, approved_hours, submitted_hours, reviewed_at, reviewer_id'),
		db().from('user_expedition_progress').select('user_id, hours_earned').gt('hours_earned', 0),
		db().from('users').select('id, display_name').eq('role', 'admin'),
		// separate queries so a missing country column can't take the rest down
		db().from('hackclub_submissions').select('user_id, country, airtable_created_at').not('country', 'is', null),
		db().from('submission_queue').select('user_id, country, created_at').not('country', 'is', null)
	]);

	// ---- sign-up funnel (real Hack Club accounts only)
	const real = new Set((users.data ?? []).map((u) => u.id));
	const distinct = (rows: { user_id: string | null }[] | null) =>
		new Set((rows ?? []).map((r) => r.user_id).filter((id): id is string => !!id && real.has(id))).size;
	const submittedUsers = new Set(
		[...(hcSubs.data ?? []), ...(queue.data ?? [])].map((r) => r.user_id).filter((id): id is string => !!id && real.has(id))
	);
	const funnel = [
		{ step: 'Signed up', n: real.size },
		{ step: 'Connected Hackatime', n: distinct(connections.data) },
		{ step: 'Added a project', n: distinct(projects.data) },
		{ step: 'Submitted a project', n: submittedUsers.size },
		{ step: 'Got hours approved', n: distinct(progress.data) }
	];

	// ---- one row per submission, across both systems
	const fromQueue = new Map((queue.data ?? []).filter((q) => q.airtable_record_id).map((q) => [q.airtable_record_id as string, q]));
	const reviewBy = new Map((reviews.data ?? []).map((r) => [r.airtable_record_id, r]));
	type Sub = { submittedAt: string; outcome: 'waiting' | 'approved' | 'changes' | 'rejected'; decidedAt: string | null; reviewer: string | null; hardware: boolean; tracked: number | null; approved: number | null };
	const subs: Sub[] = [];
	for (const q of queue.data ?? []) {
		if (q.status === 'sent') continue; // counted below, from its Airtable row
		subs.push({
			submittedAt: q.created_at,
			outcome: q.status === 'pending' ? 'waiting' : q.status === 'rejected' ? 'rejected' : 'changes',
			decidedAt: q.status === 'pending' ? null : q.reviewed_at,
			reviewer: q.reviewer_id,
			hardware: q.hardware,
			tracked: null,
			approved: null
		});
	}
	for (const s of hcSubs.data ?? []) {
		const r = reviewBy.get(s.airtable_record_id);
		const q = fromQueue.get(s.airtable_record_id);
		const status = r?.status ?? 'pending';
		subs.push({
			// a queued submission's clock starts when the participant submitted, not when it was sent
			submittedAt: q?.created_at ?? s.airtable_created_at ?? new Date().toISOString(),
			outcome: status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : status === 'changes_requested' ? 'changes' : 'waiting',
			decidedAt: status === 'pending' || status === 'in_review' ? null : (r?.reviewed_at ?? null),
			reviewer: r?.reviewer_id ?? null,
			hardware: q?.hardware ?? false,
			tracked: r?.submitted_hours === null || r?.submitted_hours === undefined ? null : Number(r.submitted_hours),
			approved: r?.approved_hours === null || r?.approved_hours === undefined ? null : Number(r.approved_hours)
		});
	}

	// ---- review speed
	const now = Date.now();
	const waiting = subs.filter((s) => s.outcome === 'waiting');
	const decided = subs.filter((s) => s.outcome !== 'waiting' && s.decidedAt);
	const turnaround = decided.map((s) => (new Date(s.decidedAt!).getTime() - new Date(s.submittedAt).getTime()) / HOUR_MS).filter((h) => h >= 0);
	const oldest = waiting.reduce<string | null>((o, s) => (!o || s.submittedAt < o ? s.submittedAt : o), null);
	const week = now - 7 * 24 * HOUR_MS;
	const names = new Map((reviewers.data ?? []).map((u) => [u.id, u.display_name ?? 'Admin']));
	const perReviewer = new Map<string, number>();
	for (const s of decided) if (s.reviewer) perReviewer.set(s.reviewer, (perReviewer.get(s.reviewer) ?? 0) + 1);

	// ---- submitted vs decided per day, last 30 days (UTC days)
	const DAYS = 30;
	const dayKey = (iso: string) => iso.slice(0, 10);
	const start = new Date(now - (DAYS - 1) * 24 * HOUR_MS);
	const timeline: { day: string; submitted: number; decided: number }[] = [];
	for (let i = 0; i < DAYS; i++) {
		const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + i));
		timeline.push({ day: d.toISOString().slice(0, 10), submitted: 0, decided: 0 });
	}
	const byDay = new Map(timeline.map((t) => [t.day, t]));
	for (const s of subs) {
		const a = byDay.get(dayKey(s.submittedAt));
		if (a) a.submitted++;
		if (s.outcome !== 'waiting' && s.decidedAt) {
			const b = byDay.get(dayKey(s.decidedAt));
			if (b) b.decided++;
		}
	}

	// ---- where people are from: each person's most recent country
	const latestCountry = new Map<string, { at: string; country: string }>();
	const noteCountry = (userId: string | null, raw: string | null, at: string | null) => {
		const country = normaliseCountry(raw);
		if (!userId || !country || !real.has(userId)) return;
		const prev = latestCountry.get(userId);
		if (!prev || (at ?? '') > prev.at) latestCountry.set(userId, { at: at ?? '', country });
	};
	for (const r of hcCountries.data ?? []) noteCountry(r.user_id, r.country, r.airtable_created_at);
	for (const r of queueCountries.data ?? []) noteCountry(r.user_id, r.country, r.created_at);
	const perCountry = new Map<string, number>();
	for (const { country } of latestCountry.values()) perCountry.set(country, (perCountry.get(country) ?? 0) + 1);
	const countries = [...perCountry.entries()]
		.map(([country, n]) => ({ country, n, trip: estimateTrip(country) }))
		.sort((a, b) => b.n - a.n || a.country.localeCompare(b.country));
	const userCountry = Object.fromEntries([...latestCountry.entries()].map(([id, v]) => [id, v.country]));

	// ---- hours
	const approvedSubs = subs.filter((s) => s.outcome === 'approved');
	const withBoth = approvedSubs.filter((s) => s.tracked && s.tracked > 0 && s.approved !== null);
	const trackedSum = withBoth.reduce((t, s) => t + (s.tracked ?? 0), 0);
	const approvedSum = withBoth.reduce((t, s) => t + (s.approved ?? 0), 0);
	const byTrack = (hw: boolean) => {
		const a = approvedSubs.filter((s) => s.hardware === hw);
		return { submissions: subs.filter((s) => s.hardware === hw).length, approved: a.length, hours: round1(a.reduce((t, s) => t + (s.approved ?? 0), 0)) };
	};
	const count = (o: Sub['outcome']) => subs.filter((s) => s.outcome === o).length;

	return {
		funnel,
		timeline,
		countries,
		countriesKnown: latestCountry.size,
		userCountry,
		speed: {
			waiting: waiting.length,
			oldestWaitingHours: oldest ? round1((now - new Date(oldest).getTime()) / HOUR_MS) : null,
			medianHours: turnaround.length ? round1(median(turnaround)!) : null,
			averageHours: turnaround.length ? round1(turnaround.reduce((a, b) => a + b, 0) / turnaround.length) : null,
			submittedThisWeek: subs.filter((s) => new Date(s.submittedAt).getTime() >= week).length,
			decidedThisWeek: decided.filter((s) => new Date(s.decidedAt!).getTime() >= week).length,
			reviewers: [...perReviewer.entries()].map(([id, n]) => ({ name: names.get(id) ?? 'Former admin', n })).sort((a, b) => b.n - a.n)
		},
		hours: {
			total: subs.length,
			approved: count('approved'),
			changes: count('changes'),
			rejected: count('rejected'),
			waiting: count('waiting'),
			trackedOnApproved: round1(trackedSum),
			approvedHours: round1(approvedSubs.reduce((t, s) => t + (s.approved ?? 0), 0)),
			cutPercent: trackedSum > 0 ? Math.round((1 - approvedSum / trackedSum) * 100) : null,
			software: byTrack(false),
			hardware: byTrack(true)
		}
	};
}
