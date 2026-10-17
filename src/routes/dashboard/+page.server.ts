import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireUser, isAdmin } from '$lib/server/guards';
import {
	getBalance,
	getProgress,
	listOwnReviews,
	countPendingReviews,
	listHackClubSubmissions,
	listOwnClaims,
	listConnectedProjects,
	connectProject,
	disconnectProject,
	moveTravelHours,
	getTravelBuckets
} from '$lib/server/queries';
import { connectionStatus, fetchProjectTimes, formatHours } from '$lib/server/hackatime';
import { syncHackClubSubmissions } from '$lib/server/airtable';
import { listOwnQueued, countQueuePending, hackatimeNames } from '$lib/server/queue';
import { listOwnCheckpoints, unlockedCount } from '$lib/server/checkpoints';
import { drops, TRAVEL_CAP_HOURS, TRAVEL_RATE, hoursToQualify, money } from '$lib/data';
import { getOwnClaim, submitClaim, type QualificationClaim } from '$lib/server/qualification';
import type { TripEstimate } from '$lib/travel-estimates';

/**
 * Approved hours they need: from a confirmed qualification claim (their real
 * trip cost) if they have one, else the estimate, else the 40h maximum.
 */
function targetHours(est: TripEstimate | null, claim: QualificationClaim | null): number {
	if (claim?.status === 'approved') return hoursToQualify(claim.trip_cost_usd);
	return est ? est.hoursToQualify : TRAVEL_CAP_HOURS;
}
import { listOwnTravelClaims, travelClaimable, createTravelClaim, withdrawTravelClaim } from '$lib/server/travel-claims';
import { notifyTravelClaim, notifyTravelBanked, notifyQualificationClaim } from '$lib/server/notify';
import { myReferrals } from '$lib/server/referrals';
import { getFlightQuote } from '$lib/server/flight-quotes';
import { getOwnOrigin, recordOrigin } from '$lib/server/origins';
import { estimateTrip } from '$lib/travel-estimates';
import { countryName } from '$lib/server/geo';
import { getOwnFlight, confirmBooking } from '$lib/server/flights';
import { text, hours, oneOf, url, ValidationError } from '$lib/server/validate';
import type { TravelBucket } from '$lib/server/database.types';

const BUCKETS = ['visa', 'accommodation', 'flights'] as const satisfies readonly TravelBucket[];
import type { SubmissionReviewRow } from '$lib/server/database.types';

export type DashboardProject = {
	name: string;
	seconds: number;
	tracked: string;
	languages: string[];
	/** Best-effort match against Hack Club's free-text project field — see
	 *  docs/backend.md. Never used to compute hours, only to show status. */
	submitted: boolean;
	review: SubmissionReviewRow | null;
	/** newest submission still waiting in Expedition's own review queue */
	queued: {
		id: string;
		status: 'pending' | 'changes_requested' | 'rejected';
		participant_feedback: string | null;
	} | null;
	connected: boolean;
	checkpointsPosted: number;
	checkpointsUnlocked: number;
};

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals, '/dashboard');

	const hackatime = await connectionStatus(user.id);

	const [balance, progress, ownReviews, pendingReviews, claims, connected, travelBuckets, queued] =
		await Promise.all([
			getBalance(user.id),
			getProgress(user.id),
			listOwnReviews(user.id),
			isAdmin(user)
				? Promise.all([countPendingReviews(), countQueuePending()]).then(([a, b]) => a + b)
				: Promise.resolve(null),
			listOwnClaims(user.id),
			listConnectedProjects(user.id),
			getTravelBuckets(user.id),
			listOwnQueued(user.id)
		]);
	const [ownCheckpoints, flight, origin, travelClaims, referrals, claim, claimable] = await Promise.all([
		listOwnCheckpoints(user.id),
		getOwnFlight(user.id),
		getOwnOrigin(user.id),
		listOwnTravelClaims(user.id),
		myReferrals(user.id).catch((e) => {
			console.error('myReferrals', e);
			return null;
		}),
		getOwnClaim(user.id).catch(() => null),
		travelClaimable(user.id).catch(() => null)
	]);
	// their trip: estimated cost from their home airport, and how far they are from qualifying
	const approvedHours = Number(progress.hours_earned);
	const tripEstimate = origin ? estimateTrip(origin) : null;
	const target = targetHours(tripEstimate, claim);
	// the cheapest real fare from their airport (Google Flights, cached per
	// airport); streamed, so the dashboard never waits on Google
	const quote = tripEstimate?.flight ? getFlightQuote(tripEstimate.airport).catch(() => null) : Promise.resolve(null);
	const trip = {
		estimate: tripEstimate,
		quote,
		claim,
		country: origin ? countryName(origin.country_code) : null,
		approved: approvedHours,
		target,
		remaining: Math.max(0, Math.round((target - approvedHours) * 100) / 100)
	};
	const checkpointsByProject = new Map<string, number>();
	for (const c of ownCheckpoints) {
		checkpointsByProject.set(c.hackatime_project, (checkpointsByProject.get(c.hackatime_project) ?? 0) + 1);
	}

	// newest queued submission per project, until it's been sent to Hack Club
	const queuedByProject = new Map<string, DashboardProject['queued']>();
	for (const q of queued) {
		for (const name of q.hackatime_projects?.length ? q.hackatime_projects : [q.project_name]) {
			const key = name.toLowerCase();
			if (queuedByProject.has(key)) continue;
			queuedByProject.set(
				key,
				q.status === 'sent' ? null : { id: q.id, status: q.status, participant_feedback: q.participant_feedback }
			);
		}
	}

	let projects: DashboardProject[] = [];
	let others: { name: string; seconds: number; tracked: string }[] = [];
	let hackatimeUnavailable = false;
	let syncError = false;

	if (hackatime.connected) {
		// Sync just this user's submissions — cheap, and keeps their own
		// status fresh. A sync failure falls back to the last cached copy
		// rather than turning the dashboard into a 500.
		const [times, submissions] = await Promise.all([
			fetchProjectTimes(user.id),
			hackatime.hackatimeUserId
				? syncHackClubSubmissions(hackatime.hackatimeUserId).catch(() => {
						syncError = true;
						return listHackClubSubmissions(user.id);
					})
				: Promise.resolve([])
		]);

		hackatimeUnavailable = times === null;

		const rawNames = submissions.map((s) => (s.project_names_raw ?? '').toLowerCase());
		// a review can cover several Hackatime projects; each of them shows it
		const reviewsByProject = new Map(
			ownReviews.flatMap((r) =>
				(r.hackatime_projects?.length ? r.hackatime_projects : [r.hackatime_project]).map(
					(n) => [n.toLowerCase(), r] as const
				)
			)
		);
		const connectedSet = new Set(connected);

		const all = (times ?? [])
			.filter((t) => !t.archived)
			.map((t) => ({
				name: t.name,
				seconds: t.totalSeconds,
				tracked: formatHours(t.totalSeconds),
				languages: t.languages.slice(0, 3),
				submitted: rawNames.some((raw) => raw.includes(t.name.toLowerCase())),
				review: reviewsByProject.get(t.name.toLowerCase()) ?? null,
				queued: queuedByProject.get(t.name.toLowerCase()) ?? null,
				connected: connectedSet.has(t.name),
				checkpointsPosted: checkpointsByProject.get(t.name) ?? 0,
				checkpointsUnlocked: unlockedCount(t.totalSeconds / 3600)
			}));

		// Anything already submitted or reviewed stays visible even if it was
		// never connected — hours they've earned shouldn't disappear.
		projects = all
			.filter((p) => p.connected || p.submitted || p.review || p.queued)
			.sort((a, b) => connected.indexOf(a.name) - connected.indexOf(b.name) || b.seconds - a.seconds);
		others = all
			.filter((p) => !projects.includes(p))
			.sort((a, b) => b.seconds - a.seconds)
			.map(({ name, seconds, tracked }) => ({ name, seconds, tracked }));
	}

	const claimed = new Set(claims.filter((c) => c.status !== 'cancelled').map((c) => c.reward_key));
	const available = Number(balance.hours_available);
	const unlocks = drops.filter((d) => !d.finisher).map((d) => ({
		hours: d.hours,
		name: d.name,
		extra: d.extra ?? null,
		value: d.value,
		image: d.image ?? null,
		state: claimed.has(String(d.hours))
			? ('claimed' as const)
			: available >= d.hours
				? ('ready' as const)
				: ('locked' as const)
	}));

	return {
		user: { display_name: user.display_name, email: user.email, role: user.role },
		balance,
		progress,
		hackatime,
		hackatimeUnavailable,
		syncError,
		projects,
		others,
		unlocks,
		travelBuckets,
		pendingReviews,
		trip,
		referrals: referrals ? { ...referrals, link: referrals.code ? `${url.origin}/join?ref=${referrals.code}` : null } : null,
		travelClaims,
		claimable,
		// hardware sent in without a Hackatime project: no project card to hang off
		untracked: queued
			.filter((q) => !hackatimeNames(q).length)
			.map((q) => ({ id: q.id, name: q.project_name, status: q.status, feedback: q.participant_feedback, submittedAt: q.created_at })),
		flight,
		flash: url.searchParams.get('hackatime')
	};
};

export const actions: Actions = {
	connect: async ({ request, locals }) => {
		const user = requireUser(locals, '/dashboard');
		const form = await request.formData();
		try {
			const name = text(form.get('project'), 'Project', { max: 200, required: true })!;
			const times = await fetchProjectTimes(user.id);
			if (times && !times.some((t) => t.name === name)) {
				return fail(400, { message: "That project isn't in your Hackatime." });
			}
			await connectProject(user.id, name);
			return { connected: name };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message });
			console.error('connect project', e);
			return fail(500, { message: "Couldn't add that project just now. Try again in a moment." });
		}
	},

	/** One action for both directions — `direction` says which. */
	travel: async ({ request, locals }) => {
		const user = requireUser(locals, '/dashboard');
		const form = await request.formData();
		try {
			const amount = hours(form.get('hours'), 'Hours');
			const bucket = oneOf(form.get('bucket'), BUCKETS, 'What it goes toward');
			const direction = form.get('direction') === 'back' ? -1 : 1;
			if (direction < 0) {
				// hours in a claim are spoken for
				const free = (await travelClaimable(user.id))[bucket].free;
				if (amount > free) {
					return fail(409, { travelMessage: `Only ${free}h of your ${bucket} hours are unclaimed, so that's the most you can move back.` });
				}
			}
			const result = await moveTravelHours(user.id, direction * amount, bucket);
			if (!result.ok) return fail(409, { travelMessage: result.message });
			if (direction > 0) {
				// let the organisers know someone's putting hours towards the trip
				const after = await getBalance(user.id);
				await notifyTravelBanked({
					name: user.display_name,
					hours: amount,
					bucket,
					totalHours: Number(after.hours_travel),
					locked: !!after.travel_locked_at
				}).catch(() => {});
			}
			return { travelMoved: direction * amount, travelBucket: bucket };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { travelMessage: e.message });
			throw e;
		}
	},

	/** They've booked the flight an organiser gave them (or a different one). */
	bookFlight: async ({ request, locals }) => {
		const user = requireUser(locals, '/dashboard');
		const form = await request.formData();
		try {
			const ref = text(form.get('booking_ref'), 'Booking reference', { max: 20, required: true })!;
			let different: { flight: string; arrivesAt: string } | null = null;
			if (form.get('different') === 'yes') {
				const flight = text(form.get('booked_flight'), 'Flight you booked', { max: 80, required: true })!;
				const raw = String(form.get('booked_arrives_at') ?? '').trim();
				if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
					throw new ValidationError('Add when it lands in Ireland (Irish time)', 'booked_arrives_at');
				}
				different = { flight, arrivesAt: new Date(`${raw}:00Z`).toISOString() };
			}
			if (!(await confirmBooking(user.id, { ref, different }))) {
				return fail(404, { flightMessage: "We couldn't find a flight for you. Ask an organiser." });
			}
			return { flightBooked: true };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { flightMessage: e.message });
			throw e;
		}
	},

	/**
	 * Claim what's banked (and not yet claimed) for one of visa / flights /
	 * accommodation. Only once they qualify. Claiming again later, after
	 * banking more, adds on as a new claim.
	 */
	claimTravel: async ({ request, locals }) => {
		const user = requireUser(locals, '/dashboard');
		const form = await request.formData();
		try {
			const bucket = oneOf(form.get('bucket'), BUCKETS, 'What it goes toward');
			const note = text(form.get('note'), 'Note', { max: 1000 });
			const [progress, origin, qclaim] = await Promise.all([getProgress(user.id), getOwnOrigin(user.id), getOwnClaim(user.id).catch(() => null)]);
			const needed = targetHours(origin ? estimateTrip(origin) : null, qclaim);
			const approved = Number(progress.hours_earned);
			if (approved < needed) return fail(400, { grantMessage: `You need ${needed}h approved to qualify. You have ${approved}h.` });
			const before = (await listOwnTravelClaims(user.id)).some((c) => c.bucket === bucket && ['requested', 'approved', 'paid'].includes(c.status));
			const claimRow = await createTravelClaim(user.id, bucket, note);
			if (!claimRow) return fail(409, { grantMessage: `Nothing new banked for ${bucket} to claim. Bank more hours first.` });
			await notifyTravelClaim({ name: user.display_name, bucket, hours: Number(claimRow.hours), usd: Number(claimRow.usd), addOn: before, note }).catch(() => {});
			return { travelClaimed: { bucket, usd: Number(claimRow.usd) } };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { grantMessage: e.message });
			throw e;
		}
	},

	withdrawTravelClaim: async ({ request, locals }) => {
		const user = requireUser(locals, '/dashboard');
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!/^[0-9a-f-]{36}$/.test(id)) return fail(400, { grantMessage: 'Invalid claim.' });
		await withdrawTravelClaim(user.id, id);
		return { travelClaimWithdrawn: true };
	},

	/** "My approved hours cover half my real trip cost": checked here, then an organiser confirms. */
	claimQualification: async ({ request, locals }) => {
		const user = requireUser(locals, '/dashboard');
		const form = await request.formData();
		try {
			const cost = Number(form.get('trip_cost'));
			if (!Number.isFinite(cost) || cost < 1 || cost > 20000) {
				return fail(400, { claimMessage: 'Enter what your trip actually costs, in dollars.' });
			}
			const tripCost = Math.round(cost);
			const flightLink = url(form.get('flight_link'), 'Flight link');
			const note = text(form.get('note'), 'Note', { max: 1000 });
			const approved = Number((await getProgress(user.id)).hours_earned);
			const needed = hoursToQualify(tripCost);
			if (approved < needed) {
				return fail(400, {
					claimMessage: `${approved} approved hours is ${money(approved * TRAVEL_RATE)}, but half of ${money(tripCost)} is ${money(tripCost / 2)}. You need ${needed}h.`
				});
			}
			const ok = await submitClaim(user.id, { tripCostUsd: tripCost, flightLink, approvedHours: approved, note });
			if (!ok) return fail(409, { claimMessage: "You've already claimed. An organiser will check it." });
			await notifyQualificationClaim({ name: user.display_name, approvedHours: approved, tripCostUsd: tripCost, flightLink, note }).catch(() => {});
			return { claimSent: true };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { claimMessage: e.message });
			throw e;
		}
	},

	/** Set their home airport from a city they type (only the airport is kept). */
	setHome: async ({ request, locals }) => {
		const user = requireUser(locals, '/dashboard');
		const form = await request.formData();
		try {
			const city = text(form.get('city'), 'City', { max: 100, required: true })!;
			const country = text(form.get('country'), 'Country', { max: 100, required: true })!;
			const ok = await recordOrigin(user.id, { city, state: null, country });
			if (!ok) return fail(400, { homeMessage: `Couldn't find "${country}". Try the full country name.` });
			return { homeSet: true };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { homeMessage: e.message });
			throw e;
		}
	},

	disconnect: async ({ request, locals }) => {
		const user = requireUser(locals, '/dashboard');
		const form = await request.formData();
		try {
			const name = text(form.get('project'), 'Project', { max: 200, required: true })!;
			await disconnectProject(user.id, name);
			return { disconnected: name };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message });
			console.error('disconnect project', e);
			return fail(500, { message: "Couldn't remove that project just now." });
		}
	}
};
