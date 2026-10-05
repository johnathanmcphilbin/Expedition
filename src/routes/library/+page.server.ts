import type { PageServerLoad } from './$types';
import { listLibraryProjects } from '$lib/server/queue';
import { listPublicCheckpoints } from '$lib/server/checkpoints';

/**
 * The public library: approved projects their builders chose to show, plus
 * shared checkpoints an organiser has OK'd.
 */
export const load: PageServerLoad = async () => {
	const [projects, checkpoints] = await Promise.all([listLibraryProjects(), listPublicCheckpoints(30)]);
	return { projects, checkpoints };
};
