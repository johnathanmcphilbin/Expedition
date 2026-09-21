import type { PageServerLoad } from './$types';
import { requireUser } from '$lib/server/guards';
import { getOwnedProject, listProjectSubmissions } from '$lib/server/queries';
import { uuid } from '$lib/server/validate';

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = requireUser(locals, `/projects/${params.id}`);
	// getOwnedProject 404s if this project belongs to somebody else
	const project = await getOwnedProject(uuid(params.id, 'project'), user.id);
	return { project, submissions: await listProjectSubmissions(project.id) };
};
