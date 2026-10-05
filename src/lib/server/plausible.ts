import { env } from '$env/dynamic/private';

/**
 * Visitor numbers from Plausible's Stats API, for the admin funnel. Needs
 * PLAUSIBLE_API_KEY (Plausible → Settings → API keys, "Stats API"); without
 * it everything here returns null and the admin page just leaves visits out.
 * Cached for 10 minutes so the admin page doesn't spend the API's rate limit.
 */

const SITE = () => env.PLAUSIBLE_SITE_ID?.trim() || 'expedition.hackclub.com';
const TTL = 10 * 60 * 1000;
let cache: { at: number; key: string; value: unknown } | null = null;

type Row = { dimensions: string[]; metrics: number[] };

async function query(body: Record<string, unknown>): Promise<Row[] | null> {
	const key = env.PLAUSIBLE_API_KEY?.trim();
	if (!key) return null;
	const res = await fetch('https://plausible.io/api/v2/query', {
		method: 'POST',
		headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ site_id: SITE(), ...body }),
		signal: AbortSignal.timeout(10000)
	});
	if (!res.ok) {
		console.error('plausible', res.status, (await res.text()).slice(0, 200));
		return null;
	}
	return ((await res.json()) as { results: Row[] }).results ?? [];
}

export type Visits = {
	/** unique visitors over the whole range */
	visitors: number;
	visits: number;
	pageviews: number;
	/** unique visitors per day, YYYY-MM-DD */
	daily: Record<string, number>;
	from: string;
	to: string;
};

/** Visitors from `from` (YYYY-MM-DD) to today. */
export async function getVisits(from: string): Promise<Visits | null> {
	const to = new Date().toISOString().slice(0, 10);
	const cacheKey = `${from}:${to}`;
	if (cache && cache.key === cacheKey && Date.now() - cache.at < TTL) return cache.value as Visits | null;

	try {
		const range = [from, to];
		const [totals, days] = await Promise.all([
			query({ metrics: ['visitors', 'visits', 'pageviews'], date_range: range }),
			query({ metrics: ['visitors'], date_range: range, dimensions: ['time:day'] })
		]);
		if (!totals || !days) return null;
		const [visitors = 0, visits = 0, pageviews = 0] = totals[0]?.metrics ?? [];
		const value: Visits = {
			visitors,
			visits,
			pageviews,
			daily: Object.fromEntries(days.map((r) => [r.dimensions[0].slice(0, 10), r.metrics[0]])),
			from,
			to
		};
		cache = { at: Date.now(), key: cacheKey, value };
		return value;
	} catch (e) {
		console.error('plausible', e);
		return null;
	}
}
