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
import { ValidationError, isAllowedImage } from '$lib/server/validate';
import { parseSubmissionFields } from '$lib/server/submission-fields';
import { queueSubmission, listOwnQueued } from '$lib/server/queue';
import { notifySubmission } from '$lib/server/notify';
import { normaliseLapseLinks, LAPSE_FIELD } from '$lib/server/lapse';

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
		for (const name of q.hackatime_projects?.length ? q.hackatime_projects : [q.project_name]) {
			const key = name.toLowerCase();
			if (!queuedByProject.has(key) && q.status !== 'sent') queuedByProject.set(key, q.status);
		}
	}

	const submittedNames = submissions.map((s) => (s.project_names_raw ?? '').toLowerCase());
	const reviewByProject = new Map(
		reviews.flatMap((r) =>
			(r.hackatime_projects?.length ? r.hackatime_projects : [r.hackatime_project]).map(
				(n) => [n.toLowerCase(), r] as const
			)
		)
	);

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
			const missing = times ? fields.hackatime_projects.filter((n) => !times.some((t) => t.name === n)) : [];
			if (missing.length) {
				throw new ValidationError(`"${missing[0]}" isn't in your Hackatime`, 'project');
			}

			// one waiting submission per project, so the same hours can't be queued twice
			const waiting = (await listOwnQueued(user.id)).filter((q) => q.status === 'pending');
			const dupe = fields.hackatime_projects.find((n) =>
				waiting.some((q) => (q.hackatime_projects?.length ? q.hackatime_projects : [q.project_name]).includes(n))
			);
			if (dupe) {
				throw new ValidationError(`"${dupe}" is already waiting for review. Hang tight until it's decided.`, 'project');
			}

			let lapse: string | null;
			try {
				lapse = normaliseLapseLinks(typeof form.get('lapse_links') === 'string' ? (form.get('lapse_links') as string) : null);
			} catch (e) {
				throw new ValidationError((e as Error).message, 'lapse_links');
			}

			const file = form.get('screenshot');
			if (!(file instanceof File) || file.size === 0) {
				throw new ValidationError('Add a screenshot of your project', 'screenshot');
			}
			if (!isAllowedImage(file)) {
				throw new ValidationError('The screenshot needs to be a PNG, JPEG, WebP, GIF or AVIF image', 'screenshot');
			}
			if (file.size > MAX_SCREENSHOT) {
				throw new ValidationError('That screenshot is over 4 MB. Try a smaller one', 'screenshot');
			}

			// Waits for an Expedition reviewer; it only goes to Hack Club once
			// approved (see src/lib/server/queue.ts).
			await queueSubmission(user.id, hackatime.hackatimeUserId, fields, file, form.get('library') === 'yes', lapse ? { [LAPSE_FIELD]: lapse } : {});
			for (const n of fields.hackatime_projects) await connectProject(user.id, n).catch(() => {});

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
