import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireUser } from '$lib/server/guards';
import { createProject, claimedHackatimeProjects } from '$lib/server/queries';
import { text, url as validUrl, ValidationError } from '$lib/server/validate';
import { fetchProjectTimes, formatHours } from '$lib/server/hackatime';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals, '/projects/new');

	// Offer their Hackatime projects so the mapping is a pick, not a typo, and
	// mark the ones another Expedition project already tracks.
	const [times, claimed] = await Promise.all([
		fetchProjectTimes(user.id),
		claimedHackatimeProjects(user.id)
	]);

	const taken = new Set(claimed);

	return {
		connected: times !== null,
		hackatimeProjects: (times ?? []).map((t) => ({
			name: t.name,
			tracked: formatHours(t.totalSeconds),
			taken: taken.has(t.name)
		}))
	};
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
			// projects_one_hackatime_per_user — the same tracked time cannot count
			// towards two projects. Surfaced as a form error, not a 500.
			if (e instanceof Error && e.message.includes('projects_one_hackatime_per_user')) {
				return fail(400, {
					message: 'One of your other projects is already tracking that Hackatime project.',
					field: 'hackatime_project'
				});
			}
			throw e;
		}
	}
};
