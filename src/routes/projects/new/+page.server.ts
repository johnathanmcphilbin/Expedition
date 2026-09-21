import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireUser } from '$lib/server/guards';
import { createProject } from '$lib/server/queries';
import { text, url as validUrl, ValidationError } from '$lib/server/validate';
import { fetchProjectTimes } from '$lib/server/hackatime';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals, '/projects/new');
	// Offer their Hackatime projects so the mapping is a pick, not a typo.
	const times = await fetchProjectTimes(user.id);
	return { hackatimeProjects: times?.map((t) => t.name) ?? [] };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const user = requireUser(locals);
		const form = await request.formData();

		try {
			const project = await createProject(user.id, {
				title: text(form.get('title'), 'Title', { max: 120, required: true })!,
				description: text(form.get('description'), 'Description', { max: 4000 }),
				repo_url: validUrl(form.get('repo_url'), 'Repo URL'),
				demo_url: validUrl(form.get('demo_url'), 'Demo URL'),
				hackatime_project: text(form.get('hackatime_project'), 'Hackatime project', { max: 200 })
			});
			redirect(303, `/projects/${project.id}`);
		} catch (e) {
			if (e instanceof ValidationError) {
				return fail(400, { message: e.message, field: e.field });
			}
			throw e;
		}
	}
};
