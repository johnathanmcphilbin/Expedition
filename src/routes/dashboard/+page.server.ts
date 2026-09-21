import type { PageServerLoad } from './$types';
import { requireUser, isReviewer } from '$lib/server/guards';
import { listProjects, listSubmissions, getBalance, countPendingReviews } from '$lib/server/queries';
import { connectionStatus } from '$lib/server/hackatime';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals, '/dashboard');

	const [projects, submissions, balance, hackatime] = await Promise.all([
		listProjects(user.id),
		listSubmissions(user.id),
		getBalance(user.id),
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
		// connectionStatus deliberately returns no tokens
		hackatime,
		pendingReviews: isReviewer(user) ? await countPendingReviews() : null,
		flash: url.searchParams.get('hackatime')
	};
};
