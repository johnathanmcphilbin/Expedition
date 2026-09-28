import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireUser } from '$lib/server/guards';
import { connectionStatus, fetchProjectTimes, formatHours } from '$lib/server/hackatime';
import {
	listProjectCheckpoints,
	postCheckpoint,
	setOwnSharing,
	unlockedCount,
	CHECKPOINT_EVERY_HOURS
} from '$lib/server/checkpoints';
import { text, url, uuid, ValidationError } from '$lib/server/validate';

const MAX_IMAGE = 4 * 1024 * 1024;

export const load: PageServerLoad = async ({ locals, url: pageUrl }) => {
	const user = requireUser(locals, `/checkpoint${pageUrl.search}`);
	const hackatime = await connectionStatus(user.id);
	if (!hackatime.connected) redirect(303, '/auth/hackatime?next=/dashboard');

	const project = pageUrl.searchParams.get('project') ?? '';
	const times = await fetchProjectTimes(user.id);
	const t = times?.find((p) => p.name === project) ?? null;
	if (times && !t) redirect(303, '/dashboard');

	const trackedHours = t ? t.totalSeconds / 3600 : 0;
	const posted = await listProjectCheckpoints(user.id, project);
	const unlocked = unlockedCount(trackedHours);
	const next = posted.length + 1;

	return {
		project,
		tracked: t ? formatHours(t.totalSeconds) : null,
		hackatimeUnavailable: times === null,
		unlocked,
		next,
		canPost: unlocked >= next,
		// hours until the next one unlocks, for the "not yet" state
		hoursToNext: Math.max(0, next * CHECKPOINT_EVERY_HOURS - trackedHours),
		every: CHECKPOINT_EVERY_HOURS,
		checkpoints: posted.map((c) => ({
			id: c.id,
			number: c.number,
			tracked_hours: c.tracked_hours,
			worked_on: c.worked_on,
			next_up: c.next_up,
			video_url: c.video_url,
			image_url: c.image_url,
			visibility: c.visibility,
			created_at: c.created_at
		}))
	};
};

export const actions: Actions = {
	post: async ({ request, locals }) => {
		const user = requireUser(locals, '/dashboard');
		const form = await request.formData();
		try {
			const project = text(form.get('project'), 'Project', { max: 200, required: true })!;
			const workedOn = text(form.get('worked_on'), 'What you worked on', { max: 2000, required: true })!;
			const nextUp = text(form.get('next_up'), "What's next", { max: 1000 });
			const videoUrl = url(form.get('video_url'), 'Video link');
			const share = form.get('share') === 'yes';

			let image = form.get('image');
			if (!(image instanceof File) || image.size === 0) image = null;
			if (image) {
				if (!image.type.startsWith('image/')) throw new ValidationError('The screenshot needs to be an image');
				if (image.size > MAX_IMAGE) throw new ValidationError('That screenshot is over 4 MB. Try a smaller one');
			}
			if (!image && !videoUrl) throw new ValidationError('Add a screenshot or a video link');

			// tracked time and the checkpoint number come from the server, never the form
			const times = await fetchProjectTimes(user.id);
			const t = times?.find((p) => p.name === project);
			if (!t) throw new ValidationError("Couldn't find that project in your Hackatime right now. Try again in a minute.");
			const trackedHours = t.totalSeconds / 3600;
			const posted = await listProjectCheckpoints(user.id, project);
			const number = posted.length + 1;
			if (unlockedCount(trackedHours) < number) {
				throw new ValidationError(`Your next checkpoint unlocks at ${number * CHECKPOINT_EVERY_HOURS} tracked hours.`);
			}

			const result = await postCheckpoint({
				userId: user.id,
				project,
				number,
				trackedHours,
				workedOn,
				nextUp,
				videoUrl,
				image,
				share
			});
			if (!result.ok) return fail(409, { message: result.message });
			return { posted: number };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message });
			throw e;
		}
	},

	share: async ({ request, locals }) => {
		const user = requireUser(locals, '/dashboard');
		const form = await request.formData();
		try {
			const id = uuid(form.get('id')?.toString(), 'checkpoint');
			await setOwnSharing(user.id, id, form.get('share') === 'yes');
			return { shareUpdated: true };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message });
			throw e;
		}
	}
};
