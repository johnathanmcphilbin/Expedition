import type { PageServerLoad } from './$types';
import { requireUser, isAdmin } from '$lib/server/guards';
import {
	getBalance,
	getProgress,
	listOwnReviews,
	countPendingReviews,
	listHackClubSubmissions
} from '$lib/server/queries';
import { connectionStatus, fetchProjectTimes, formatHours } from '$lib/server/hackatime';
import { syncHackClubSubmissions } from '$lib/server/airtable';
import type { SubmissionReviewRow } from '$lib/server/database.types';

export type DashboardProject = {
	name: string;
	trackedSeconds: number;
	tracked: string;
	/** Best-effort match against Hack Club's free-text project field — see
	 *  docs/backend.md. Never used to compute hours, only to show status. */
	submitted: boolean;
	review: SubmissionReviewRow | null;
};

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals, '/dashboard');

	const hackatime = await connectionStatus(user.id);

	const [balance, progress, ownReviews, pendingReviews] = await Promise.all([
		getBalance(user.id),
		getProgress(user.id),
		listOwnReviews(user.id),
		isAdmin(user) ? countPendingReviews() : Promise.resolve(null)
	]);

	let projects: DashboardProject[] = [];
	let hackatimeUnavailable = false;
	let syncError = false;

	if (hackatime.connected) {
		// Sync just this user's submissions — cheap, and keeps their own
		// status fresh without waiting for an admin to open the full queue.
		// A sync failure (Airtable down/rate-limited/misconfigured) must not
		// turn "check your dashboard" into a 500 — fall back to whatever was
		// cached before and say so, same as /admin/reviews does.
		const [times, submissions] = await Promise.all([
			fetchProjectTimes(user.id),
			hackatime.hackatimeUserId
				? syncHackClubSubmissions(hackatime.hackatimeUserId).catch(() => {
						syncError = true;
						// fall back to whatever was cached from the last
						// successful sync, rather than showing nothing
						return listHackClubSubmissions(user.id);
					})
				: Promise.resolve([])
		]);

		hackatimeUnavailable = times === null;

		const rawNames = submissions.map((s) => (s.project_names_raw ?? '').toLowerCase());
		const reviewsByProject = new Map(
			ownReviews.map((r) => [r.hackatime_project.toLowerCase(), r])
		);

		projects = (times ?? [])
			.filter((t) => !t.archived)
			.map((t) => ({
				name: t.name,
				trackedSeconds: t.totalSeconds,
				tracked: formatHours(t.totalSeconds),
				submitted: rawNames.some((raw) => raw.includes(t.name.toLowerCase())),
				review: reviewsByProject.get(t.name.toLowerCase()) ?? null
			}))
			.sort((a, b) => b.trackedSeconds - a.trackedSeconds);
	}

	return {
		user: {
			display_name: user.display_name,
			email: user.email,
			role: user.role
		},
		balance,
		progress,
		hackatime,
		hackatimeUnavailable,
		syncError,
		projects,
		pendingReviews,
		flash: url.searchParams.get('hackatime')
	};
};
