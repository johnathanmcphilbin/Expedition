import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireUser } from '$lib/server/guards';
import {
	getOwnedProject,
	listProjectSubmissions,
	updateOwnedProject,
	claimedHackatimeProjects,
	getProjectHours
} from '$lib/server/queries';
import { uuid, text, ValidationError } from '$lib/server/validate';
import { fetchProjectTimes, formatHours } from '$lib/server/hackatime';

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = requireUser(locals, `/projects/${params.id}`);
	// getOwnedProject 404s if this project belongs to somebody else
	const project = await getOwnedProject(uuid(params.id, 'project'), user.id);

	const [submissions, times, claimed, hours] = await Promise.all([
		listProjectSubmissions(project.id),
		fetchProjectTimes(user.id),
		// this project's own mapping is not a conflict with itself
		claimedHackatimeProjects(user.id, project.id),
		getProjectHours(project.id)
	]);

	const taken = new Set(claimed);
	const match = times?.find((t) => t.name === project.hackatime_project);

	const hoursEarned = hours?.hours_earned ?? 0;
	// whole 5-hour blocks: how far into the next one, and how much is left
	const nextCheckpointAt = hoursEarned % 5 === 0 ? hoursEarned + 5 : Math.ceil(hoursEarned / 5) * 5;

	return {
		project,
		submissions,
		connected: times !== null,
		tracked: match ? formatHours(match.totalSeconds) : null,
		hackatimeProjects: (times ?? []).map((t) => ({
			name: t.name,
			tracked: formatHours(t.totalSeconds),
			taken: taken.has(t.name)
		})),
		progress: {
			hoursEarned,
			checkpointsApproved: hours?.checkpoints_approved ?? 0,
			nextCheckpointAt,
			hoursToNextCheckpoint: Math.max(nextCheckpointAt - hoursEarned, 0),
			// Every verified hour is worth $5 of gear — same figure as the hero.
			rewardValue: hoursEarned * 5
		}
	};
};

export const actions: Actions = {
	/** Connect (or clear) the Hackatime project this Expedition project tracks. */
	connect: async ({ request, locals, params }) => {
		const user = requireUser(locals);
		const form = await request.formData();

		try {
			await updateOwnedProject(uuid(params.id, 'project'), user.id, {
				hackatime_project: text(form.get('hackatime_project'), 'Hackatime project', { max: 200 })
			});
			return { connected: true };
		} catch (e) {
			if (e instanceof ValidationError) {
				return fail(400, { message: e.message, field: e.field });
			}
			if (e instanceof Error && e.message.includes('projects_one_hackatime_per_user')) {
				return fail(400, {
					message: 'Another of your projects is already tracking that Hackatime project.',
					field: 'hackatime_project'
				});
			}
			throw e;
		}
	}
};
