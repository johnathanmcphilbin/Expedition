import type { PageServerLoad } from './$types';
import { requireUser, isAdmin } from '$lib/server/guards';
import {
	listProjectsWithHours,
	listSubmissions,
	getBalance,
	getProgress,
	countPendingReviews
} from '$lib/server/queries';
import { connectionStatus } from '$lib/server/hackatime';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals, '/dashboard');

	const [projects, submissions, balance, progress, hackatime] = await Promise.all([
		listProjectsWithHours(user.id),
		listSubmissions(user.id),
		getBalance(user.id),
		getProgress(user.id),
		connectionStatus(user.id)
	]);

	return {
		user: {
			display_name: user.display_name,
			email: user.email,
			role: user.role
		},
		projects,
		submissions,
		balance,
		// totalled across every project — one expedition, many projects
		progress,
		// connectionStatus deliberately returns no tokens
		hackatime,
		pendingReviews: isAdmin(user) ? await countPendingReviews() : null,
		flash: url.searchParams.get('hackatime')
	};
};
