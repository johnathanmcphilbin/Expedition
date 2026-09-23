import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireUser } from '$lib/server/guards';
import { connectionStatus, fetchProjectTimes, formatHours } from '$lib/server/hackatime';
import { createProject, hasAnyProject, claimedHackatimeProjects } from '$lib/server/queries';
import { text, url as validUrl, ValidationError } from '$lib/server/validate';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals, '/onboarding');

	// Onboarding is a one-time gate, not a page you can revisit — once there's
	// a project, later logins go straight to the dashboard (see auth/callback).
	// A direct visit here after the fact should behave the same way.
	if (await hasAnyProject(user.id)) {
		redirect(303, '/dashboard');
	}

	const hackatime = await connectionStatus(user.id);

	let projects: { name: string; tracked: string; languages: string[]; taken: boolean }[] = [];
	if (hackatime.connected) {
		const [times, claimed] = await Promise.all([
			fetchProjectTimes(user.id),
			claimedHackatimeProjects(user.id)
		]);
		const taken = new Set(claimed);
		projects = (times ?? [])
			.filter((t) => !t.archived)
			// most recently worked on first — what they're likely mid-flow on,
			// not necessarily their all-time biggest project
			.sort((a, b) => {
				const at = a.mostRecentHeartbeat ? Date.parse(a.mostRecentHeartbeat) : 0;
				const bt = b.mostRecentHeartbeat ? Date.parse(b.mostRecentHeartbeat) : 0;
				return bt - at;
			})
			.map((t) => ({
				name: t.name,
				tracked: formatHours(t.totalSeconds),
				languages: t.languages.slice(0, 1),
				taken: taken.has(t.name)
			}));
	}

	return {
		hackatime,
		projects,
		flash: url.searchParams.get('hackatime')
	};
};

export const actions: Actions = {
	/** Step 3, path A: pick a project Hackatime already knows about. */
	connectExisting: async ({ request, locals }) => {
		const user = requireUser(locals);
		const form = await request.formData();

		try {
			const hackatimeProject = text(form.get('hackatime_project'), 'Project', {
				max: 200,
				required: true
			})!;
			const project = await createProject(user.id, {
				title: hackatimeProject,
				description: null,
				repo_url: null,
				demo_url: null,
				hackatime_project: hackatimeProject
			});
			redirect(303, `/projects/${project.id}`);
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message });
			if (e instanceof Error && e.message.includes('projects_one_hackatime_per_user')) {
				return fail(400, { message: 'That project is already connected.' });
			}
			throw e;
		}
	},

	/** Step 3, path B: starting from scratch — Hackatime has nothing to show yet. */
	startNew: async ({ request, locals }) => {
		const user = requireUser(locals);
		const form = await request.formData();

		try {
			const project = await createProject(user.id, {
				title: text(form.get('title'), 'Project name', { max: 120, required: true })!,
				description: text(form.get('description'), 'What are you making?', { max: 4000 }),
				repo_url: validUrl(form.get('repo_url'), 'GitHub URL'),
				demo_url: validUrl(form.get('demo_url'), 'Playable URL'),
				hackatime_project: null
			});
			redirect(303, `/projects/${project.id}`);
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message, field: e.field });
			throw e;
		}
	}
};
