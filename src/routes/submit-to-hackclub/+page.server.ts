import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireUser } from '$lib/server/guards';
import { connectionStatus, fetchProjectTimes, formatHours, fetchHackatimeProfile } from '$lib/server/hackatime';
import {
	listHackClubSubmissions,
	listOwnReviews,
	listConnectedProjects,
	connectProject
} from '$lib/server/queries';
import { ValidationError } from '$lib/server/validate';
import { parseSubmissionFields } from '$lib/server/submission-fields';
import { queueSubmission, listOwnQueued } from '$lib/server/queue';
import { notifySubmission } from '$lib/server/notify';

/**
 * The one place a participant submits a project. It waits in Expedition's
 * review queue first; once a reviewer approves it, Expedition writes the row
 * into Hack Club's own Unified YSWS table (see src/lib/server/queue.ts), with
 * the Hackatime ID and project set on the server.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals, '/submit-to-hackclub');

	const hackatime = await connectionStatus(user.id);
	if (!hackatime.connected) {
		redirect(303, '/auth/hackatime?next=/submit-to-hackclub');
	}

	const [times, submissions, reviews, connected, profile, queued] = await Promise.all([
		fetchProjectTimes(user.id),
		listHackClubSubmissions(user.id),
		listOwnReviews(user.id),
		listConnectedProjects(user.id),
		fetchHackatimeProfile(user.id),
		listOwnQueued(user.id)
	]);

	// newest queued submission per project, if it hasn't been sent on yet
	const queuedByProject = new Map<string, string>();
	for (const q of queued) {
		const key = q.project_name.toLowerCase();
		if (!queuedByProject.has(key) && q.status !== 'sent') queuedByProject.set(key, q.status);
	}

	const submittedNames = submissions.map((s) => (s.project_names_raw ?? '').toLowerCase());
	const reviewByProject = new Map(reviews.map((r) => [r.hackatime_project.toLowerCase(), r]));

	const projects = (times ?? [])
		.filter((t) => !t.archived)
		.map((t) => {
			const key = t.name.toLowerCase();
			const review = reviewByProject.get(key);
			return {
				name: t.name,
				seconds: t.totalSeconds,
				tracked: formatHours(t.totalSeconds),
				languages: t.languages.slice(0, 3),
				status:
					queuedByProject.get(key) ??
					review?.status ??
					(submittedNames.some((n) => n.includes(key)) ? 'pending' : null),
				connected: connected.includes(t.name)
			};
		})
		// the ones they said they're working on come first
		.sort((a, b) => Number(b.connected) - Number(a.connected));

	// Prefilled so nobody retypes who they are: what they told Hack Club last
	// time first, then their Hack Club account, then what Hackatime knows.
	const last = queued[0] ?? submissions[0];
	const [first, ...rest] = (user.display_name ?? '').split(' ');

	return {
		projects,
		hackatimeUnavailable: times === null,
		selected: url.searchParams.get('project'),
		defaults: {
			firstName: last?.first_name ?? first ?? '',
			lastName: last?.last_name ?? rest.join(' '),
			email: last?.email ?? user.email ?? profile?.email ?? '',
			githubUsername: last?.github_username ?? profile?.githubUsername ?? ''
		}
	};
};

const MAX_SCREENSHOT = 4 * 1024 * 1024;

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const user = requireUser(locals, '/submit-to-hackclub');
		const hackatime = await connectionStatus(user.id);
		if (!hackatime.connected || !hackatime.hackatimeUserId) {
			return fail(400, { message: 'Connect Hackatime first, then submit.' });
		}

		const form = await request.formData();

		try {
			const fields = parseSubmissionFields(form);

			// only a project that's actually in their own Hackatime counts
			const times = await fetchProjectTimes(user.id);
			if (times && !times.some((t) => t.name === fields.project_name)) {
				throw new ValidationError("That project isn't in your Hackatime", 'project');
			}

			const file = form.get('screenshot');
			if (!(file instanceof File) || file.size === 0) {
				throw new ValidationError('Add a screenshot of your project', 'screenshot');
			}
			if (!file.type.startsWith('image/')) {
				throw new ValidationError('The screenshot needs to be an image', 'screenshot');
			}
			if (file.size > MAX_SCREENSHOT) {
				throw new ValidationError('That screenshot is over 4 MB. Try a smaller one', 'screenshot');
			}

			// Waits for an Expedition reviewer; it only goes to Hack Club once
			// approved (see src/lib/server/queue.ts).
			await queueSubmission(user.id, hackatime.hackatimeUserId, fields, file);
			await connectProject(user.id, fields.project_name).catch(() => {});

			await notifySubmission({
				name: `${fields.first_name} ${fields.last_name}`,
				email: fields.email,
				project: fields.project_name,
				codeUrl: fields.code_url,
				playableUrl: fields.playable_url,
				description: fields.description
			});

			return { submitted: fields.project_name };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message, field: e.field });
			console.error('submit-to-hackclub failed', e);
			return fail(502, {
				message:
					"Something went wrong saving your submission. Nothing was saved, so you can try again in a minute. If it keeps happening, let an organiser know."
			});
		}
	}
};
