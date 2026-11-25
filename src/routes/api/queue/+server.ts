import { json, type RequestHandler } from '@sveltejs/kit';
import { listPublicQueue } from '$lib/server/queue';

export const GET: RequestHandler = async ({ setHeaders }) => {
	setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600' });
	let queue: Awaited<ReturnType<typeof listPublicQueue>> = [];
	let available = true;
	let demo = false;
	try {
		queue = await listPublicQueue();
	} catch (error) {
		available = false;
		demo = true;
		queue = [
			{ position: 1, project: 'Example game', hardware: false, submittedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(), status: 'waiting' },
			{ position: 2, project: 'Example hardware build', hardware: true, submittedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), status: 'waiting' },
			{ position: 3, project: 'Example resubmission', hardware: false, submittedAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(), status: 'needs_changes' }
		];
		console.error('public queue API unavailable:', error instanceof Error ? error.message : error);
	}
	return json({
		updatedAt: new Date().toISOString(),
		available,
		demo,
		total: queue.length,
		waiting: queue.filter((item) => item.status === 'waiting').length,
		needsChanges: queue.filter((item) => item.status === 'needs_changes').length,
		hardware: queue.filter((item) => item.hardware).length,
		queue
	});
};
