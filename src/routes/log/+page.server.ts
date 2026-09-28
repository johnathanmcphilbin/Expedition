import type { PageServerLoad } from './$types';
import { listPublicCheckpoints } from '$lib/server/checkpoints';

/** The public Expedition log: shared checkpoints an organiser has OK'd. */
export const load: PageServerLoad = async () => ({
	entries: await listPublicCheckpoints()
});
