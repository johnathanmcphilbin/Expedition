// Fills flight_quotes (the dashboard's "cheapest flight right now") for every
// participant's home airport, searching Google Flights slowly from this
// machine. Run with: npm run fares
// The live site reuses these and keeps showing them even if its own refresh
// gets refused, so running this every day or two keeps prices up.
import { createClient } from '@supabase/supabase-js';
import { createQuery, Passengers, getFlights } from 'fast-flights-ts';

const OUT = '2026-12-04';
const HOME = '2026-12-06';
const DESTINATIONS = ['DUB', 'SNN'];
const PAUSE_MS = 4000; // be gentle: one search every few seconds

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (w) => {
	if (!w?.date) return null;
	const [y, m, d] = w.date;
	const [h = 0, min = 0] = w.time ?? [];
	return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')} ${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

async function search(origin, destination) {
	const query = createQuery({
		flights: [
			{ date: OUT, from_airport: origin, to_airport: destination },
			{ date: HOME, from_airport: destination, to_airport: origin }
		],
		seat: 'economy',
		trip: 'round-trip',
		passengers: new Passengers({ adults: 1 }),
		currency: 'USD'
	});
	const results = await getFlights(query, { timeout: 15000, maxRetries: 1 });
	const priced = results.filter((f) => f.price > 0);
	if (!priced.length) return null;
	const best = priced.reduce((a, b) => (b.price < a.price ? b : a));
	const legs = best.flights;
	return {
		destination,
		price_usd: Math.round(best.price),
		airlines: [...new Set(best.airlines)].join(', '),
		stops: Math.max(0, legs.length - 1),
		depart_local: fmt(legs[0]?.departure),
		arrive_local: fmt(legs[legs.length - 1]?.arrival),
		link: `https://www.google.com/travel/flights?tfs=${encodeURIComponent(query.toStr())}&hl=en&curr=USD`
	};
}

const { data: origins, error } = await db.from('travel_origins').select('airport, flight_km');
if (error) throw new Error(error.message);
// anyone close enough not to fly (under 300 km) doesn't need a fare
const airports = [...new Set(origins.filter((o) => o.flight_km >= 300).map((o) => o.airport))].sort();
console.log(`Searching ${airports.length} airports: ${airports.join(', ')}`);

let found = 0;
for (const airport of airports) {
	let best = null;
	for (const dest of DESTINATIONS) {
		try {
			const q = await search(airport, dest);
			if (q && (!best || q.price_usd < best.price_usd)) best = q;
		} catch (e) {
			console.log(`  ${airport}→${dest}: ${e.constructor.name}`);
		}
		await sleep(PAUSE_MS);
	}
	if (best) {
		await db.from('flight_quotes').upsert({ airport, ...best, fetched_at: new Date().toISOString() }, { onConflict: 'airport' });
		found++;
		console.log(`  ${airport}: $${best.price_usd} to ${best.destination} (${best.airlines}, ${best.stops} stop${best.stops === 1 ? '' : 's'})`);
	} else {
		console.log(`  ${airport}: nothing found (kept any earlier price)`);
	}
}
console.log(`Done: ${found}/${airports.length} airports have a price.`);
