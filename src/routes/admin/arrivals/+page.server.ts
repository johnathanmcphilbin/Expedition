import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/guards';
import { db } from '$lib/server/supabase';
import { listFlights, assignFlight, cancelFlight, arrivalFlags, effectiveArrival, type FlightInput } from '$lib/server/flights';
import { listOrigins } from '$lib/server/origins';
import { estimateTrip } from '$lib/travel-estimates';
import { text, uuid, oneOf, ValidationError } from '$lib/server/validate';

/** Within this long of each other at the same terminal = one pickup run. */
const RUN_GAP_MS = 90 * 60 * 1000;

/**
 * Flights to the Dublin event: who's been told which flight, who's booked,
 * and when everyone lands, grouped into airport pickup runs.
 */
export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);

	const [flights, origins, progress, users] = await Promise.all([
		listFlights(),
		listOrigins(),
		db().from('user_expedition_progress').select('user_id, hours_earned').gt('hours_earned', 0),
		db().from('users').select('id, display_name, email').like('hackclub_id', 'ident!%')
	]);

	const originBy = new Map(origins.map((o) => [o.user_id, o]));
	const flightBy = new Map(flights.map((f) => [f.user_id, f]));
	const approvedBy = new Map((progress.data ?? []).map((p) => [p.user_id as string, Number(p.hours_earned)]));
	const userBy = new Map((users.data ?? []).map((u) => [u.id, u]));

	// everyone with approved hours, plus anyone already given a flight
	const ids = new Set([...approvedBy.keys(), ...flights.map((f) => f.user_id)]);
	const people = [...ids]
		.filter((id) => userBy.has(id))
		.map((id) => {
			const u = userBy.get(id)!;
			const o = originBy.get(id);
			const trip = o ? estimateTrip(o) : null;
			const f = flightBy.get(id) ?? null;
			const approved = approvedBy.get(id) ?? 0;
			return {
				id,
				name: u.display_name ?? 'Unnamed',
				email: u.email,
				approved,
				home: o ? { airport: o.airport, name: o.airport_name } : null,
				qualifiesAt: trip?.hoursToQualify ?? null,
				qualifies: trip ? approved >= trip.hoursToQualify : false,
				flight: f
					? {
							...f,
							arrivesAt: effectiveArrival(f),
							flags: f.status === 'cancelled' ? [] : arrivalFlags(effectiveArrival(f))
						}
					: null
			};
		})
		.sort((a, b) => Number(b.qualifies) - Number(a.qualifies) || b.approved - a.approved);

	// ---- pickup runs: active flights, by landing time, per terminal
	const landing = people
		.filter((p) => p.flight && p.flight.status !== 'cancelled')
		.map((p) => ({
			id: p.id,
			name: p.name,
			flight: p.flight!.booked_flight ?? p.flight!.out_flight,
			from: p.flight!.out_from,
			terminal: p.flight!.out_terminal,
			arrivesAt: p.flight!.arrivesAt,
			status: p.flight!.status,
			flags: p.flight!.flags
		}))
		.sort((a, b) => a.arrivesAt.localeCompare(b.arrivesAt));

	type Run = { terminal: string | null; from: string; to: string; people: typeof landing };
	const runs: Run[] = [];
	for (const l of landing) {
		const run = runs.findLast((r) => r.terminal === l.terminal);
		if (run && new Date(l.arrivesAt).getTime() - new Date(run.to).getTime() <= RUN_GAP_MS) {
			run.people.push(l);
			run.to = l.arrivesAt;
		} else {
			runs.push({ terminal: l.terminal, from: l.arrivesAt, to: l.arrivesAt, people: [l] });
		}
	}
	runs.sort((a, b) => a.from.localeCompare(b.from));

	const departures = people
		.filter((p) => p.flight && p.flight.status !== 'cancelled' && p.flight.ret_departs_at)
		.map((p) => ({ id: p.id, name: p.name, flight: p.flight!.ret_flight, departsAt: p.flight!.ret_departs_at! }))
		.sort((a, b) => a.departsAt.localeCompare(b.departsAt));

	const active = people.filter((p) => p.flight && p.flight.status !== 'cancelled');
	return {
		people,
		runs,
		departures,
		counts: {
			assigned: active.length,
			booked: active.filter((p) => p.flight!.status === 'booked' || p.flight!.status === 'changed').length,
			changed: active.filter((p) => p.flight!.status === 'changed').length,
			flagged: active.filter((p) => p.flight!.flags.length).length
		}
	};
};

/** "2026-12-05T07:40" typed as Dublin time (GMT in December) → ISO. */
function dublinTime(value: FormDataEntryValue | null, field: string, required: boolean): string | null {
	const raw = typeof value === 'string' ? value.trim() : '';
	if (!raw) {
		if (required) throw new ValidationError(`${field} is required`, field);
		return null;
	}
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) throw new ValidationError(`${field} needs a date and time`, field);
	const d = new Date(`${raw}:00Z`);
	if (Number.isNaN(d.getTime())) throw new ValidationError(`${field} isn't a valid time`, field);
	return d.toISOString();
}

export const actions: Actions = {
	assign: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const form = await request.formData();
		try {
			const userId = uuid(form.get('user_id')?.toString(), 'person');
			const from = text(form.get('out_from'), 'From airport', { max: 3, required: true })!.toUpperCase();
			if (!/^[A-Z]{3}$/.test(from)) throw new ValidationError('From airport is a 3-letter code, like DEL', 'out_from');
			const terminal = form.get('out_terminal');
			const priceRaw = form.get('price_usd');
			const price = typeof priceRaw === 'string' && priceRaw.trim() ? Number(priceRaw) : null;
			if (price !== null && (!Number.isFinite(price) || price < 0 || price > 20000)) {
				throw new ValidationError('Price looks wrong', 'price_usd');
			}
			const input: FlightInput = {
				out_flight: text(form.get('out_flight'), 'Flight', { max: 80, required: true })!,
				out_from: from,
				out_departs_local: text(form.get('out_departs_local'), 'Departs', { max: 60 }),
				out_arrives_at: dublinTime(form.get('out_arrives_at'), 'Lands in Ireland', true)!,
				out_terminal: terminal ? oneOf(terminal, ['T1', 'T2'] as const, 'Terminal') : null,
				ret_flight: text(form.get('ret_flight'), 'Return flight', { max: 80 }),
				ret_departs_at: dublinTime(form.get('ret_departs_at'), 'Flies home', false),
				price_usd: price,
				organiser_notes: text(form.get('organiser_notes'), 'Notes', { max: 1000 })
			};
			await assignFlight(admin.id, userId, input);
			return { saved: userId };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message, field: e.field });
			throw e;
		}
	},

	cancel: async ({ request, locals }) => {
		requireAdmin(locals);
		const form = await request.formData();
		try {
			await cancelFlight(uuid(form.get('user_id')?.toString(), 'person'));
			return { cancelled: true };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message });
			throw e;
		}
	}
};
