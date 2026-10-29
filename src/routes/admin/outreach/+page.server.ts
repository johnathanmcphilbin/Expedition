import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/supabase';
import { logAdminAction } from '$lib/server/referrals';
import { text, uuid, ValidationError } from '$lib/server/validate';
import { requireOutreach, outreachList, OUTREACH_HOURS, OUTREACH_EUR_PER_HOUR } from '$lib/server/outreach';

export const load: PageServerLoad = async ({ locals }) => {
	const user = await requireOutreach(locals);
	const isAdmin = user.role === 'admin';
	const [list, { data: access }] = await Promise.all([
		outreachList(),
		isAdmin ? db().from('outreach_access').select('email, added_at').order('added_at') : Promise.resolve({ data: [] })
	]);
	return {
		...list,
		me: user.id,
		isAdmin,
		access: access ?? [],
		minHours: OUTREACH_HOURS,
		eurPerHour: OUTREACH_EUR_PER_HOUR
	};
};

export const actions: Actions = {
	/** Mark a builder as messaged (by me), or update the note on it. */
	contacted: async ({ request, locals }) => {
		const user = await requireOutreach(locals);
		const form = await request.formData();
		try {
			const userId = uuid(form.get('user_id')?.toString(), 'builder');
			const note = text(form.get('note'), 'Note', { max: 1000 });
			const { data: existing } = await db().from('outreach_contacts').select('contacted_by').eq('user_id', userId).maybeSingle();
			// whoever messaged them first keeps the credit; anyone can add a note
			const { error } = existing
				? await db().from('outreach_contacts').update({ note }).eq('user_id', userId)
				: await db().from('outreach_contacts').insert({ user_id: userId, contacted_by: user.id, note });
			if (error) throw new Error(error.message);
			return { ok: true };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message });
			throw e;
		}
	},

	/** Undo "messaged": yours, or anyone's for an admin. */
	uncontacted: async ({ request, locals }) => {
		const user = await requireOutreach(locals);
		const form = await request.formData();
		try {
			const userId = uuid(form.get('user_id')?.toString(), 'builder');
			let q = db().from('outreach_contacts').delete().eq('user_id', userId);
			if (user.role !== 'admin') q = q.eq('contacted_by', user.id);
			await q;
			return { ok: true };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message });
			throw e;
		}
	},

	/** Admins: let someone see this page, by the email they sign in with. */
	grant: async ({ request, locals }) => {
		const user = await requireOutreach(locals);
		if (user.role !== 'admin') return fail(403, { message: 'Only admins can do that.' });
		const email = String((await request.formData()).get('email') ?? '').trim().toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return fail(400, { message: 'That doesn’t look like an email.' });
		const { error } = await db().from('outreach_access').upsert({ email, added_by: user.id }, { onConflict: 'email', ignoreDuplicates: true });
		if (error) return fail(500, { message: error.message });
		await logAdminAction(user.id, 'outreach_access_granted', email, null);
		return { ok: true };
	},

	revoke: async ({ request, locals }) => {
		const user = await requireOutreach(locals);
		if (user.role !== 'admin') return fail(403, { message: 'Only admins can do that.' });
		const email = String((await request.formData()).get('email') ?? '').trim().toLowerCase();
		await db().from('outreach_access').delete().eq('email', email);
		await logAdminAction(user.id, 'outreach_access_revoked', email, null);
		return { ok: true };
	}
};
