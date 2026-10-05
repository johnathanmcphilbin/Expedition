import { db } from './supabase';
import type { TripFlightRow, UserRow } from './database.types';
import { EVENT } from '$lib/data';

/**
 * Flights to the Dublin event. An organiser picks the exact flight; the
 * participant books it and confirms here. Times at Dublin airport are
 * timestamptz; December in Ireland is GMT, so Dublin time is UTC.
 */

export type FlightWithOwner = TripFlightRow & { owner: Pick<UserRow, 'display_name' | 'email'> | null };

export async function listFlights(): Promise<FlightWithOwner[]> {
	const { data, error } = await db()
		.from('trip_flights')
		.select('*, users!trip_flights_user_id_fkey(display_name, email)')
		.order('out_arrives_at', { ascending: true });
	if (error) {
		console.error('listFlights', error.message);
		return [];
	}
	return ((data ?? []) as unknown as (TripFlightRow & { users: FlightWithOwner['owner'] })[]).map(
		({ users, ...f }) => ({ ...f, owner: users })
	);
}

/** Their own flight, without the organiser-only fields. */
export async function getOwnFlight(userId: string) {
	const { data } = await db().from('trip_flights').select('*').eq('user_id', userId).maybeSingle();
	if (!data || data.status === 'cancelled') return null;
	const f = data as TripFlightRow;
	return {
		outFlight: f.out_flight,
		outFrom: f.out_from,
		outDepartsLocal: f.out_departs_local,
		outArrivesAt: f.out_arrives_at,
		outTerminal: f.out_terminal,
		retFlight: f.ret_flight,
		retDepartsAt: f.ret_departs_at,
		price: f.price_usd === null ? null : Number(f.price_usd),
		notes: f.organiser_notes,
		status: f.status,
		bookedFlight: f.booked_flight,
		bookedArrivesAt: f.booked_arrives_at,
		hasBookingRef: !!f.booking_ref,
		bookedAt: f.booked_at
	};
}

export type FlightInput = {
	out_flight: string;
	out_from: string;
	out_departs_local: string | null;
	out_arrives_at: string;
	out_terminal: 'T1' | 'T2' | null;
	ret_flight: string | null;
	ret_departs_at: string | null;
	price_usd: number | null;
	organiser_notes: string | null;
};

/**
 * Set (or change) the flight someone should take. Changing the flight after
 * they've booked puts it back to "suggested" so they re-confirm.
 */
export async function assignFlight(adminId: string, userId: string, input: FlightInput): Promise<void> {
	const { data: existing } = await db().from('trip_flights').select('out_flight, out_arrives_at').eq('user_id', userId).maybeSingle();
	const changed =
		!existing ||
		existing.out_flight !== input.out_flight ||
		new Date(existing.out_arrives_at).getTime() !== new Date(input.out_arrives_at).getTime();
	const { error } = await db()
		.from('trip_flights')
		.upsert(
			{
				user_id: userId,
				...input,
				assigned_by: adminId,
				updated_at: new Date().toISOString(),
				...(changed
					? { status: 'suggested' as const, booked_flight: null, booked_arrives_at: null, booking_ref: null, booked_at: null }
					: {})
			},
			{ onConflict: 'user_id' }
		);
	if (error) throw new Error(`Couldn't save the flight: ${error.message}`);
}

export async function cancelFlight(userId: string): Promise<void> {
	const { error } = await db()
		.from('trip_flights')
		.update({ status: 'cancelled', updated_at: new Date().toISOString() })
		.eq('user_id', userId);
	if (error) throw new Error(error.message);
}

/**
 * The participant says they've booked: either the suggested flight, or a
 * different one (then what they actually booked, so pickups use that).
 */
export async function confirmBooking(
	userId: string,
	booking: { ref: string; different: { flight: string; arrivesAt: string } | null }
): Promise<boolean> {
	const { data, error } = await db()
		.from('trip_flights')
		.update({
			status: booking.different ? 'changed' : 'booked',
			booking_ref: booking.ref,
			booked_flight: booking.different?.flight ?? null,
			booked_arrives_at: booking.different?.arrivesAt ?? null,
			booked_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		})
		.eq('user_id', userId)
		.neq('status', 'cancelled')
		.select('user_id');
	if (error) throw new Error(error.message);
	return !!data?.length;
}

// --------------------------------------------------------------- pickups ----

const HOUR = 3600 * 1000;
const start = new Date(EVENT.startsAt).getTime();

export type ArrivalFlag = { level: 'warn' | 'bad'; text: string };

/**
 * Anything about a landing time that makes the pickup or the morning hard.
 * Landing to venue is about 1.5h with passport control, so 08:30 is the
 * latest that comfortably makes a 10:00 start.
 */
export function arrivalFlags(arrivesAt: string): ArrivalFlag[] {
	const t = new Date(arrivesAt).getTime();
	const hour = new Date(arrivesAt).getUTCHours();
	const flags: ArrivalFlag[] = [];
	if (t > start - 1 * HOUR) flags.push({ level: 'bad', text: 'Misses the 10:00 start' });
	else if (t > start - 1.5 * HOUR) flags.push({ level: 'warn', text: 'Tight for the 10:00 start' });
	if (t < start - 34 * HOUR) flags.push({ level: 'warn', text: 'Arrives early: needs an extra night' });
	if (hour >= 22 || hour < 6) flags.push({ level: 'warn', text: 'Night arrival: driver on call' });
	return flags;
}

/** The arrival pickups should plan around: what they booked, else the suggestion. */
export const effectiveArrival = (f: Pick<TripFlightRow, 'booked_arrives_at' | 'out_arrives_at'>) =>
	f.booked_arrives_at ?? f.out_arrives_at;
