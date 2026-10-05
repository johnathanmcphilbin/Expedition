import { db } from './supabase';
import type { TravelOriginRow } from './database.types';
import { locate, nearestAirport } from './geo';
import { getLocality } from './airtable';

type Locality = { city: string | null; state: string | null; country: string | null };

/**
 * Work out someone's nearest airport from the city on their submission and
 * keep just that. The address itself is never stored here.
 */
export async function recordOrigin(userId: string, where: Locality): Promise<boolean> {
	const spot = locate(where.city, where.state, where.country);
	if (!spot) return false;
	const a = nearestAirport(spot.lat, spot.lon, spot.country);
	const { error } = await db()
		.from('travel_origins')
		.upsert(
			{
				user_id: userId,
				airport: a.iata,
				airport_name: a.name,
				airport_city: a.city || null,
				country_code: spot.country,
				to_airport_km: a.toAirportKm,
				flight_km: a.flightKm,
				hub: a.large,
				precision: spot.precision,
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'user_id' }
		);
	if (error) throw new Error(`Couldn't save travel origin: ${error.message}`);
	return true;
}

export type TravelOrigin = TravelOriginRow;

export async function listOrigins(): Promise<TravelOrigin[]> {
	const { data, error } = await db().from('travel_origins').select('*');
	if (error) {
		console.error('listOrigins', error.message);
		return [];
	}
	return (data ?? []) as TravelOrigin[];
}

/**
 * Fill in anyone who has submitted but has no airport yet (or everyone,
 * with `all`): from a queued
 * submission that still has its city, otherwise from the address on their
 * newest Hack Club record in Airtable.
 */
export async function backfillOrigins(opts: { all?: boolean } = {}): Promise<{ found: number; missed: number }> {
	const [have, queued, sent] = await Promise.all([
		db().from('travel_origins').select('user_id'),
		db()
			.from('submission_queue')
			.select('user_id, city, state, country, created_at')
			.not('city', 'is', null)
			.order('created_at', { ascending: false }),
		db()
			.from('hackclub_submissions')
			.select('user_id, airtable_record_id, airtable_created_at')
			.not('user_id', 'is', null)
			.order('airtable_created_at', { ascending: false })
	]);
	const done = new Set(opts.all ? [] : (have.data ?? []).map((r) => r.user_id));
	let found = 0;
	let missed = 0;

	for (const q of queued.data ?? []) {
		if (done.has(q.user_id)) continue;
		done.add(q.user_id);
		if (await recordOrigin(q.user_id, q).catch(() => false)) found++;
		else missed++;
	}
	for (const s of sent.data ?? []) {
		if (!s.user_id || done.has(s.user_id)) continue;
		done.add(s.user_id);
		const where = await getLocality(s.airtable_record_id).catch(() => null);
		if (where && (await recordOrigin(s.user_id, where).catch(() => false))) found++;
		else missed++;
	}
	return { found, missed };
}
