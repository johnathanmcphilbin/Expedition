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
	moveTravelHours
} from '$lib/server/queries';
import { connectionStatus, fetchProjectTimes, formatHours } from '$lib/server/hackatime';
import { syncHackClubSubmissions } from '$lib/server/airtable';
import { drops } from '$lib/data';
import { text, hours, ValidationError } from '$lib/server/validate';
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
	connected: boolean;
};

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals, '/dashboard');

	const hackatime = await connectionStatus(user.id);

	const [balance, progress, ownReviews, pendingReviews, claims, connected] = await Promise.all([
		getBalance(user.id),
		getProgress(user.id),
		listOwnReviews(user.id),
		isAdmin(user) ? countPendingReviews() : Promise.resolve(null),
		listOwnClaims(user.id),
		listConnectedProjects(user.id)
	]);

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
		const reviewsByProject = new Map(ownReviews.map((r) => [r.hackatime_project.toLowerCase(), r]));
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
				connected: connectedSet.has(t.name)
			}));

		// Anything already submitted or reviewed stays visible even if it was
		// never connected — hours they've earned shouldn't disappear.
		projects = all
			.filter((p) => p.connected || p.submitted || p.review)
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
		pendingReviews,
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
			const direction = form.get('direction') === 'back' ? -1 : 1;
			const result = await moveTravelHours(user.id, direction * amount);
			if (!result.ok) return fail(409, { travelMessage: result.message });
			return { travelMoved: direction * amount };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { travelMessage: e.message });
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
