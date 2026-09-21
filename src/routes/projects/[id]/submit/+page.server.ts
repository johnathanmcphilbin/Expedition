import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireUser } from '$lib/server/guards';
import { getOwnedProject, createSubmission, addAttachment } from '$lib/server/queries';
import { text, hours, uuid, ValidationError } from '$lib/server/validate';
import { uploadEvidence, validateUpload } from '$lib/server/storage';
import { fetchProjectTimes, formatHours } from '$lib/server/hackatime';

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = requireUser(locals, `/projects/${params.id}/submit`);
	const project = await getOwnedProject(uuid(params.id, 'project'), user.id);

	// Show the participant the tracked time we can see, so the hours they ask
	// for are anchored to something. This is a hint, not a limit.
	let tracked: string | null = null;
	if (project.hackatime_project) {
		const times = await fetchProjectTimes(user.id);
		const match = times?.find((t) => t.name === project.hackatime_project);
		if (match) tracked = formatHours(match.totalSeconds);
	}

	return { project, tracked };
};

export const actions: Actions = {
	default: async ({ request, locals, params }) => {
		const user = requireUser(locals);
		const projectId = uuid(params.id, 'project');

		// Ownership re-checked server-side; the form's project id is not trusted.
		await getOwnedProject(projectId, user.id);

		const form = await request.formData();
		const evidence = form.get('evidence');

		try {
			const description = text(form.get('description'), 'Description', {
				max: 4000,
				min: 10,
				required: true
			})!;
			const hoursRequested = hours(form.get('hours_requested'), 'Hours');

			if (!(evidence instanceof File)) {
				throw new ValidationError('Attach a screenshot of what you built', 'evidence');
			}
			// Validate before creating the submission so a bad file cannot leave
			// an evidence-less row behind.
			validateUpload(evidence);

			const storageKey = await uploadEvidence(user.id, evidence);

			const submission = await createSubmission(user.id, {
				project_id: projectId,
				hours_requested: hoursRequested,
				description
			});

			await addAttachment(submission.id, {
				storage_key: storageKey,
				content_type: evidence.type,
				filename: evidence.name.slice(0, 200),
				size_bytes: evidence.size
			});
		} catch (e) {
			if (e instanceof ValidationError) {
				return fail(400, { message: e.message, field: e.field });
			}
			throw e;
		}

		redirect(303, `/projects/${projectId}?submitted=1`);
	}
};
