import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/guards';
import {
	attendConfig,
	countSignups,
	getSignup,
	listNotifyEmails,
	listSignups,
	readIrelandSettings,
	saveIrelandSettings,
	setSignupStatus,
	syncSignupToAttend
} from '$lib/server/ireland';
import { logAdminAction } from '$lib/server/referrals';
import { uuid, ValidationError } from '$lib/server/validate';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	const attend = attendConfig();
	try {
		const [settings, signups, notify, counts] = await Promise.all([
			readIrelandSettings(),
			listSignups(),
			listNotifyEmails(),
			countSignups()
		]);
		return {
			ready: true as const,
			settings,
			signups,
			notify,
			counts,
			attend: attend ? { on: true as const, eventId: attend.eventId } : { on: false as const }
		};
	} catch (e) {
		return {
			ready: false as const,
			message: e instanceof Error ? e.message : 'Database error',
			settings: null,
			signups: [],
			notify: [],
			counts: null,
			attend: attend ? { on: true as const, eventId: attend.eventId } : { on: false as const }
		};
	}
};

function flag(form: FormData, name: string): boolean {
	const value = form.get(name);
	return value === 'on' || value === '1' || value === 'true';
}

export const actions: Actions = {
	settings: async ({ locals, request }) => {
		const admin = requireAdmin(locals);
		const form = await request.formData();
		const raw = form.get('capacity');
		const capacity = typeof raw === 'string' ? Number(raw) : NaN;
		if (!Number.isInteger(capacity) || capacity < 0 || capacity > 10000) {
			return fail(400, { message: 'Capacity needs to be a whole number from 0 to 10000.' });
		}
		try {
			const settings = await saveIrelandSettings({ open: flag(form, 'open'), capacity });
			await logAdminAction(admin.id, 'ireland_settings', 'ireland', `open=${settings.open} capacity=${settings.capacity}`).catch(() => {});
			let message = settings.open ? 'Saved. Sign-ups are open.' : 'Saved. Sign-ups are closed.';
			if (settings.openSource === 'env') {
				message += settings.open
					? ' IRELAND_SIGNUPS_OPEN is forcing them open.'
					: ' IRELAND_SIGNUPS_OPEN is forcing them closed.';
			}
			if (settings.envOpenUnrecognised) {
				message += ' IRELAND_SIGNUPS_OPEN is set to something this app doesn’t recognise, so sign-ups stay closed.';
			}
			if (settings.capacitySource === 'env') {
				message += ` The capacity in use is ${settings.capacity}, from IRELAND_CAPACITY.`;
			}
			return { ok: true as const, message };
		} catch (e) {
			return fail(500, { message: e instanceof Error ? e.message : 'Could not save settings.' });
		}
	},

	approve: async (event) => decide(event, 'approved'),
	reject: async (event) => decide(event, 'rejected'),

	attend: async ({ locals, request }) => {
		const admin = requireAdmin(locals);
		if (!attendConfig()) {
			return fail(400, { message: 'Attend is off. Set ATTEND_API_TOKEN and ATTEND_EVENT_ID, or use the CSV.' });
		}
		const form = await request.formData();
		let id: string;
		try {
			id = uuid(String(form.get('id') ?? ''), 'sign-up');
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message });
			throw e;
		}
		const row = await getSignup(id);
		if (!row) return fail(404, { message: 'That sign-up is gone.' });
		if (row.status !== 'approved') return fail(400, { message: `${row.name} isn’t approved.` });
		const result = await syncSignupToAttend(row);
		await logAdminAction(admin.id, 'ireland_attend', id, result && !result.ok ? result.error : null).catch(() => {});
		if (!result) return fail(400, { message: 'Attend is off.' });
		if (!result.ok) return fail(502, { message: `Attend didn’t take ${row.email}: ${result.error}` });
		if (result.already) return { ok: true as const, message: `${row.name} was already on Attend.` };
		if (result.held) return { ok: true as const, message: `${row.name} is on Attend. The event is holding invitation emails.` };
		return { ok: true as const, message: `Invited ${row.name} on Attend.` };
	},

	attend_all: async ({ locals }) => {
		const admin = requireAdmin(locals);
		if (!attendConfig()) {
			return fail(400, { message: 'Attend is off. Set ATTEND_API_TOKEN and ATTEND_EVENT_ID, or use the CSV.' });
		}
		const rows = (await listSignups()).filter((row) => row.status === 'approved' && !row.attend_synced_at);
		if (!rows.length) return { ok: true as const, message: 'Everyone approved is already on Attend.' };
		let sent = 0;
		const errors: string[] = [];
		for (const row of rows) {
			const result = await syncSignupToAttend(row);
			if (result?.ok) sent++;
			else errors.push(`${row.email}: ${result?.error ?? 'failed'}`);
		}
		await logAdminAction(admin.id, 'ireland_attend_all', 'ireland', `${sent} sent, ${errors.length} failed`).catch(() => {});
		if (!errors.length) return { ok: true as const, message: `Sent ${sent} to Attend.` };
		return fail(502, { message: `Sent ${sent}. ${errors.length} failed. ${errors.slice(0, 3).join(' ')}` });
	}
};

async function decide(
	event: { locals: App.Locals; request: Request },
	status: 'approved' | 'rejected'
) {
	const admin = requireAdmin(event.locals);
	const form = await event.request.formData();
	let id: string;
	try {
		id = uuid(String(form.get('id') ?? ''), 'sign-up');
	} catch (e) {
		if (e instanceof ValidationError) return fail(400, { message: e.message });
		throw e;
	}
	const before = await getSignup(id);
	if (!before) return fail(404, { message: 'That sign-up is gone.' });
	const settings = await readIrelandSettings();
	const result = await setSignupStatus({
		id,
		status,
		override: flag(form, 'override'),
		adminId: admin.id,
		capacity: settings.capacity
	});
	if (!result.ok && result.error === 'capacity') {
		return fail(409, {
			message: `Approving ${before.name} would put approved people past ${settings.capacity}. Tick the override on that row to do it anyway.`
		});
	}
	if (!result.ok) return fail(404, { message: 'That sign-up is gone.' });

	await logAdminAction(admin.id, status === 'approved' ? 'ireland_approve' : 'ireland_reject', id, flag(form, 'override') ? 'override' : null).catch(
		() => {}
	);

	let message = status === 'approved' ? `Approved ${before.name}.` : `Rejected ${before.name}.`;
	if (result.promoted > 0) {
		message += result.promoted === 1 ? ' Someone on the waitlist moved to pending.' : ` ${result.promoted} waitlisted sign-ups moved to pending.`;
	}
	if (status === 'approved' && attendConfig()) {
		const row = await getSignup(id);
		if (row) {
			const synced = await syncSignupToAttend(row);
			if (synced && !synced.ok) message += ` Attend didn’t take the invite: ${synced.error}`;
			else if (synced?.held) message += ' Attend recorded the invite and is holding the email.';
			else if (synced?.already) message += ' They were already on Attend.';
			else if (synced?.ok) message += ' Invited on Attend.';
		}
	}
	if (status === 'rejected' && before.attend_synced_at) {
		message += ' They’re still on Attend until you remove them there.';
	}
	return { ok: true as const, message };
}
