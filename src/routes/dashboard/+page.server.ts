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
import { listOwnQueued, countQueuePending } from '$lib/server/queue';
import { listOwnCheckpoints, unlockedCount } from '$lib/server/checkpoints';
import { drops } from '$lib/data';
import { getOwnFlight, confirmBooking } from '$lib/server/flights';
import { text, hours, oneOf, ValidationError } from '$lib/server/validate';
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
	const [ownCheckpoints, flight] = await Promise.all([listOwnCheckpoints(user.id), getOwnFlight(user.id)]);
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
				q.status === 'sent' ? null : { status: q.status, participant_feedback: q.participant_feedback }
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
			const result = await moveTravelHours(user.id, direction * amount, bucket);
			if (!result.ok) return fail(409, { travelMessage: result.message });
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
					throw new ValidationError('Add when it lands in Dublin (Irish time)', 'booked_arrives_at');
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
