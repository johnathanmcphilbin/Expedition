import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireUser } from '$lib/server/guards';
import { connectionStatus, fetchProjectTimes, formatHours } from '$lib/server/hackatime';
import { createSubmission } from '$lib/server/airtable';
import {
	listHackClubSubmissions,
	listOwnReviews,
	listConnectedProjects,
	connectProject
} from '$lib/server/queries';
import { db } from '$lib/server/supabase';
import { text, url, email, ValidationError } from '$lib/server/validate';

/**
 * The one place a participant submits a project. Expedition builds the row
 * in Hack Club's own Unified YSWS table itself (see createSubmission), rather
 * than embedding their Airtable form — so the Hackatime ID and project are
 * set on the server and the submission always links back to this account.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals, '/submit-to-hackclub');

	const hackatime = await connectionStatus(user.id);
	if (!hackatime.connected) {
		redirect(303, '/auth/hackatime?next=/submit-to-hackclub');
	}

	const [times, submissions, reviews, connected] = await Promise.all([
		fetchProjectTimes(user.id),
		listHackClubSubmissions(user.id),
		listOwnReviews(user.id),
		listConnectedProjects(user.id)
	]);

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
				status: review?.status ?? (submittedNames.some((n) => n.includes(key)) ? 'pending' : null),
				connected: connected.includes(t.name)
			};
		})
		// the ones they said they're working on come first
		.sort((a, b) => Number(b.connected) - Number(a.connected));

	// Anything they've told Hack Club before, so a second project isn't a
	// second round of typing the same name and email.
	const last = submissions[0];
	const [first, ...rest] = (user.display_name ?? '').split(' ');

	return {
		projects,
		hackatimeUnavailable: times === null,
		selected: url.searchParams.get('project'),
		defaults: {
			firstName: last?.first_name ?? first ?? '',
			lastName: last?.last_name ?? rest.join(' '),
			email: last?.email ?? user.email ?? '',
			githubUsername: last?.github_username ?? ''
		}
	};
};

const MAX_SCREENSHOT = 4 * 1024 * 1024;

function birthday(value: FormDataEntryValue | null): string {
	const raw = text(value, 'Birthday', { max: 10, required: true })!;
	const d = new Date(`${raw}T00:00:00Z`);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(d.getTime())) {
		throw new ValidationError('Birthday must be a real date', 'birthday');
	}
	if (d.getTime() > Date.now() || d.getUTCFullYear() < 1900) {
		throw new ValidationError('Birthday must be a real date', 'birthday');
	}
	return raw;
}

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const user = requireUser(locals, '/submit-to-hackclub');
		const hackatime = await connectionStatus(user.id);
		if (!hackatime.connected || !hackatime.hackatimeUserId) {
			return fail(400, { message: 'Connect Hackatime first, then submit.' });
		}

		const form = await request.formData();

		try {
			const projectName = text(form.get('project'), 'Project', { max: 200, required: true })!;

			// only a project that's actually in their own Hackatime counts
			const times = await fetchProjectTimes(user.id);
			if (times && !times.some((t) => t.name === projectName)) {
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

			const submission = {
				hackatimeUserId: hackatime.hackatimeUserId,
				projectName,
				codeUrl: url(form.get('code_url'), 'Code link', { required: true })!,
				playableUrl: url(form.get('playable_url'), 'Demo link', { required: true })!,
				description: text(form.get('description'), 'Description', { min: 20, max: 4000, required: true })!,
				firstName: text(form.get('first_name'), 'First name', { max: 100, required: true })!,
				lastName: text(form.get('last_name'), 'Last name', { max: 100, required: true })!,
				email: email(form.get('email'), 'Email'),
				githubUsername: text(form.get('github_username'), 'GitHub username', { max: 100, required: true })!,
				birthday: birthday(form.get('birthday')),
				addressLine1: text(form.get('address_line1'), 'Address', { max: 200, required: true })!,
				addressLine2: text(form.get('address_line2'), 'Address line 2', { max: 200 }),
				city: text(form.get('city'), 'City', { max: 100, required: true })!,
				state: text(form.get('state'), 'State / province', { max: 100, required: true })!,
				country: text(form.get('country'), 'Country', { max: 100, required: true })!,
				zip: text(form.get('zip'), 'Postal code', { max: 20, required: true })!,
				heardAbout: text(form.get('heard_about'), 'How you heard', { max: 1000 }),
				doingWell: text(form.get('doing_well'), 'What we do well', { max: 2000 }),
				improve: text(form.get('improve'), 'What to improve', { max: 2000 })
			};

			const record = await createSubmission(submission, {
				bytes: await file.arrayBuffer(),
				contentType: file.type,
				filename: file.name || 'screenshot.png'
			});

			await connectProject(user.id, projectName).catch(() => {});

			// Cache it straight away, already linked to this account, so it
			// shows up on their dashboard and in the review queue immediately.
			await db()
				.from('hackclub_submissions')
				.upsert(
					{
						airtable_record_id: record.id,
						user_id: user.id,
						hackatime_user_id: submission.hackatimeUserId,
						first_name: submission.firstName,
						last_name: submission.lastName,
						email: submission.email,
						github_username: submission.githubUsername,
						code_url: submission.codeUrl,
						playable_url: submission.playableUrl,
						description: submission.description,
						project_names_raw: submission.projectName,
						airtable_status: null,
						airtable_created_at: record.createdTime,
						synced_at: new Date().toISOString()
					},
					{ onConflict: 'airtable_record_id' }
				);

			return { submitted: projectName };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message, field: e.field });
			console.error('submit-to-hackclub failed', e);
			return fail(502, {
				message:
					"Something went wrong sending this to Hack Club. Nothing was saved, so you can try again in a minute. If it keeps happening, let an organiser know."
			});
		}
	}
};
