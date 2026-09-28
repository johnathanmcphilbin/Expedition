import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/guards';
import { getBalance } from '$lib/server/queries';
import { fetchProjectTimes, formatHours } from '$lib/server/hackatime';
import {
	listQueue,
	getQueued,
	screenshotUrl,
	updateQueuedFields,
	decideQueued,
	sendQueued,
	reopenQueued
} from '$lib/server/queue';
import { parseSubmissionFields } from '$lib/server/submission-fields';
import { listProjectCheckpoints, unlockedCount } from '$lib/server/checkpoints';
import { hours, text, uuid, oneOf, ValidationError } from '$lib/server/validate';

const TABS = ['pending', 'changes_requested', 'rejected', 'sent'] as const;
type Tab = (typeof TABS)[number];

export const load: PageServerLoad = async ({ locals, url }) => {
	requireAdmin(locals);

	const all = await listQueue();
	const tabParam = url.searchParams.get('status') as Tab | null;
	const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : 'pending';

	const counts = Object.fromEntries(TABS.map((t) => [t, all.filter((r) => r.status === t).length])) as Record<
		Tab,
		number
	>;
	const rows = all.filter((r) => r.status === tab);
	// newest first once decided; oldest first while waiting, so nobody sits there longest
	if (tab !== 'pending') rows.reverse();

	const selectedId = url.searchParams.get('id');
	const selected = (selectedId && all.find((r) => r.id === selectedId)) || rows[0] || null;

	let detail = null;
	if (selected) {
		const [times, balance, shot] = await Promise.all([
			fetchProjectTimes(selected.user_id),
			getBalance(selected.user_id),
			screenshotUrl(selected.screenshot_path)
		]);
		const projects = (times ?? []).map((t) => ({ name: t.name, tracked: formatHours(t.totalSeconds), seconds: t.totalSeconds }));
		const picked = selected.hackatime_projects?.length ? selected.hackatime_projects : [selected.project_name];
		const matched = projects.filter((p) => picked.includes(p.name));
		const checkpoints = (await Promise.all(picked.map((n) => listProjectCheckpoints(selected.user_id, n)))).flat();
		detail = {
			row: selected,
			picked,
			screenshot: shot,
			projects,
			hackatimeUnavailable: times === null,
			checkpoints,
			checkpointsUnlocked: matched.reduce((sum, p) => sum + unlockedCount(p.seconds / 3600), 0),
			trackedHours: matched.length
				? Math.round((matched.reduce((sum, p) => sum + p.seconds, 0) / 3600) * 100) / 100
				: null,
			balance
		};
	}

	return {
		tab,
		counts,
		queue: rows.map((r) => ({
			id: r.id,
			name: `${r.first_name} ${r.last_name}`.trim() || r.owner?.display_name || 'Unknown',
			project: r.project_name,
			hardware: r.hardware,
			createdAt: r.created_at
		})),
		detail
	};
};

export const actions: Actions = {
	/** Rejected / needs changes -> back to waiting, notes and feedback kept. */
	reopen: async ({ request, locals }) => {
		requireAdmin(locals);
		const form = await request.formData();
		try {
			const id = uuid(form.get('id')?.toString(), 'submission');
			await reopenQueued(id);
			redirect(303, `/admin/reviews/incoming?status=pending&id=${id}`);
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message });
			throw e;
		}
	},

	/**
	 * One form, four buttons: save the edits, then either leave it waiting,
	 * ask for changes, reject, or approve — which sends it to Hack Club.
	 */
	save: async ({ request, locals, url }) => {
		const reviewer = requireAdmin(locals);
		const form = await request.formData();

		let id: string;
		try {
			id = uuid(form.get('id')?.toString(), 'submission');
			const row = await getQueued(id);
			if (!row) return fail(404, { message: 'That submission no longer exists.' });
			if (row.status === 'sent') return fail(409, { message: 'This one has already been sent to Hack Club.' });

			const decision = oneOf(
				form.get('decision'),
				['draft', 'approve', 'changes_requested', 'rejected'] as const,
				'Decision'
			);
			const fields = parseSubmissionFields(form);

			const times = await fetchProjectTimes(row.user_id);
			const missing = times ? fields.hackatime_projects.filter((n) => !times.some((t) => t.name === n)) : [];
			if (missing.length) {
				throw new ValidationError(`"${missing[0]}" isn't in their Hackatime`, 'project');
			}

			const approvedRaw = form.get('approved_hours');
			const approvedHours =
				typeof approvedRaw === 'string' && approvedRaw.trim() ? hours(approvedRaw, 'Approved hours') : null;
			const internalNotes = text(form.get('internal_notes'), 'Private notes', { max: 4000 });
			const feedback = text(form.get('participant_feedback'), 'Feedback', { max: 4000 });

			if (decision === 'approve' && approvedHours === null) {
				return fail(400, { message: 'Set how many hours to approve before sending it.' });
			}
			if ((decision === 'changes_requested' || decision === 'rejected') && !feedback) {
				return fail(400, { message: 'Give them some feedback to act on.' });
			}

			await updateQueuedFields(id, fields);

			if (decision === 'approve') {
				const matched = (times ?? []).filter((t) => fields.hackatime_projects.includes(t.name));
				const result = await sendQueued({
					id,
					reviewer,
					approvedHours: approvedHours!,
					internalNotes,
					participantFeedback: feedback,
					submittedHours: matched.length ? matched.reduce((sum, t) => sum + t.totalSeconds, 0) / 3600 : null
				});
				if (!result.ok) return fail(502, { message: result.message });
			} else {
				await decideQueued(
					id,
					reviewer.id,
					decision === 'draft' ? 'pending' : decision,
					approvedHours,
					internalNotes,
					feedback
				);
			}

			if (decision === 'draft') return { saved: true };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message, field: e.field });
			throw e;
		}

		// decided: move on to the next one waiting
		const qs = new URLSearchParams();
		if (url.searchParams.get('status')) qs.set('status', url.searchParams.get('status')!);
		redirect(303, `/admin/reviews/incoming${qs.toString() ? `?${qs}` : ''}`);
	}
};
