import type { PageServerLoad } from './$types';
import { listPublicQueue } from '$lib/server/queue';

export const load: PageServerLoad = async () => {
	let queue: Awaited<ReturnType<typeof listPublicQueue>> = [];
	let unavailable = false;
	let demo = false;
	try {
		queue = await listPublicQueue();
	} catch (error) {
		unavailable = true;
		demo = true;
		queue = [
			{ position: 1, project: 'Example game', hardware: false, submittedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(), status: 'waiting' },
			{ position: 2, project: 'Example hardware build', hardware: true, submittedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), status: 'waiting' },
			{ position: 3, project: 'Example resubmission', hardware: false, submittedAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(), status: 'needs_changes' }
		];
		console.error('public queue unavailable:', error instanceof Error ? error.message : error);
	}
	return {
		queue,
		waiting: queue.filter((item) => item.status === 'waiting').length,
		needsChanges: queue.filter((item) => item.status === 'needs_changes').length,
		hardware: queue.filter((item) => item.hardware).length,
		unavailable,
		demo
	};
};
