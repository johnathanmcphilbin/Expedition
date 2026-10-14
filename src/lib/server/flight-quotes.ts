import { createQuery, Passengers, getFlights } from 'fast-flights-ts';
import { db } from './supabase';
import { EVENT } from '$lib/data';

/**
 * Cheapest return fare from a home airport to Ireland for the event, from
 * Google Flights (via fast-flights-ts, which calls Google's own flight
 * search endpoint). Unofficial, so it's treated as best-effort: cached per
 * airport, asked rarely, and any failure just means no price is shown.
 */

const FRESH = 12 * 3600 * 1000; // a found price is reused for 12h
const RETRY = 3 * 3600 * 1000; // after a miss, don't ask again for 3h
// Dublin is usually cheapest; Shannon is closer to Galway
const DESTINATIONS = ['DUB', 'SNN'] as const;

export type FlightQuote = {
	destination: string;
	priceUsd: number;
	airlines: string;
	stops: number;
	departLocal: string | null;
	arriveLocal: string | null;
	link: string;
	fetchedAt: string;
};

type When = { readonly date: readonly number[]; readonly time?: readonly number[] };
const fmt = (w: When | undefined) => {
	if (!w?.date) return null;
	const [y, m, d] = w.date;
	const [h = 0, min = 0] = w.time ?? [];
	return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')} ${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

async function search(origin: string, destination: string): Promise<Omit<FlightQuote, 'fetchedAt'> | null> {
	const query = createQuery({
		flights: [
			{ date: EVENT.flyOutDate, from_airport: origin, to_airport: destination },
			{ date: EVENT.flyHomeDate, from_airport: destination, to_airport: origin }
		],
		seat: 'economy',
		trip: 'round-trip',
		passengers: new Passengers({ adults: 1 }),
		currency: 'USD'
	});
	const results = await getFlights(query, { timeout: 10_000, maxRetries: 1 });
	const priced = results.filter((f) => typeof f.price === 'number' && f.price > 0);
	if (!priced.length) return null;
	const best = priced.reduce((a, b) => (b.price < a.price ? b : a));
	const legs = best.flights;
	return {
		destination,
		priceUsd: Math.round(best.price),
		airlines: [...new Set(best.airlines)].join(', '),
		stops: Math.max(0, legs.length - 1),
		departLocal: fmt(legs[0]?.departure),
		arriveLocal: fmt(legs[legs.length - 1]?.arrival),
		link: `https://www.google.com/travel/flights?tfs=${encodeURIComponent(query.toStr())}&hl=en&curr=USD`
	};
}

export async function getFlightQuote(airport: string): Promise<FlightQuote | null> {
	if (!/^[A-Z]{3}$/.test(airport) || (DESTINATIONS as readonly string[]).includes(airport)) return null;
	const { data: hit } = await db().from('flight_quotes').select('*').eq('airport', airport).maybeSingle();
	const age = hit ? Date.now() - new Date(hit.fetched_at).getTime() : Infinity;
	const cached = (): FlightQuote | null =>
		hit && hit.price_usd !== null
			? {
					destination: hit.destination!,
					priceUsd: hit.price_usd,
					airlines: hit.airlines ?? '',
					stops: hit.stops ?? 0,
					departLocal: hit.depart_local,
					arriveLocal: hit.arrive_local,
					link: hit.link!,
					fetchedAt: hit.fetched_at
				}
			: null;
	if (hit && age < (hit.price_usd === null ? RETRY : FRESH)) return cached();

	try {
		const found = (await Promise.all(DESTINATIONS.map((d) => search(airport, d).catch(() => null)))).filter(
			(q): q is NonNullable<typeof q> => !!q
		);
		const best = found.reduce<(typeof found)[number] | null>((a, b) => (!a || b.priceUsd < a.priceUsd ? b : a), null);
		const row = {
			airport,
			destination: best?.destination ?? null,
			price_usd: best?.priceUsd ?? null,
			airlines: best?.airlines ?? null,
			stops: best?.stops ?? null,
			depart_local: best?.departLocal ?? null,
			arrive_local: best?.arriveLocal ?? null,
			link: best?.link ?? null,
			fetched_at: new Date().toISOString()
		};
		// a miss doesn't wipe out the last good price
		if (best || !hit) await db().from('flight_quotes').upsert(row, { onConflict: 'airport' });
		else await db().from('flight_quotes').update({ fetched_at: row.fetched_at }).eq('airport', airport);
		return best ? { ...best, fetchedAt: row.fetched_at } : cached();
	} catch (e) {
		console.error('getFlightQuote', airport, e);
		return cached();
	}
}
