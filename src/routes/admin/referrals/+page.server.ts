import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/guards';
import { db } from '$lib/server/supabase';
import { referralAdmin, logAdminAction } from '$lib/server/referrals';
import { text, uuid, ValidationError } from '$lib/server/validate';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	return referralAdmin();
};

/** Every action is written to admin_actions. */
export const actions: Actions = {
	reconcile: async ({ locals }) => {
		const admin = requireAdmin(locals);
		const { data, error } = await db().rpc('referral_reconcile');
		if (error) return fail(500, { message: error.message });
		await logAdminAction(admin.id, 'reconcile_referrals', 'all', `${data} paid`);
		return { done: `Reconciled: ${data} reward${data === 1 ? '' : 's'} paid.` };
	},

	/** hold / release / reject / flag a referred builder's attribution */
	attribution: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const form = await request.formData();
		try {
			const referred = uuid(form.get('referred_id')?.toString(), 'participant');
			const op = String(form.get('op'));
			const note = text(form.get('note'), 'Note', { max: 500 });
			if (op === 'hold') {
				await db().from('referral_attributions').update({ status: 'held', flag: note ?? 'Held by an admin' }).eq('referred_id', referred);
			} else if (op === 'release') {
				await db().from('referral_attributions').update({ status: 'active', flag: null }).eq('referred_id', referred);
				// pay anything that was waiting on the hold
				await db().rpc('referral_reconcile');
			} else if (op === 'flag') {
				if (!note) return fail(400, { message: 'Say what looks suspicious.' });
				await db().from('referral_attributions').update({ flag: note }).eq('referred_id', referred);
			} else if (op === 'reject') {
				if (!note) return fail(400, { message: 'Give a reason for rejecting it.' });
				await db().from('referral_attributions').update({ status: 'rejected', flag: note }).eq('referred_id', referred);
				// and take back anything it already paid
				const { data: earned } = await db().from('referral_rewards').select('id').eq('referred_id', referred).eq('status', 'earned');
				for (const w of earned ?? []) await db().rpc('referral_reverse', { p_reward_id: w.id, p_admin_id: admin.id, p_note: `Referral rejected: ${note}` });
			} else {
				return fail(400, { message: 'Unknown action.' });
			}
			await logAdminAction(admin.id, `referral_${op}`, referred, note);
			return { done: `Referral ${op === 'hold' ? 'held' : op === 'release' ? 'released' : op === 'flag' ? 'flagged' : 'rejected'}.` };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message });
			throw e;
		}
	},

	/** reverse one reward with a negative ledger row (the original stays) */
	reverse: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const form = await request.formData();
		try {
			const id = uuid(form.get('reward_id')?.toString(), 'reward');
			const note = text(form.get('note'), 'Note', { max: 500 });
			if (!note) return fail(400, { message: 'Give a reason for reversing it.' });
			const { data, error } = await db().rpc('referral_reverse', { p_reward_id: id, p_admin_id: admin.id, p_note: note });
			if (error) return fail(500, { message: error.message });
			if (!data) return fail(409, { message: 'Already reversed.' });
			return { done: 'Reward reversed.' };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message });
			throw e;
		}
	},

	/** turn someone's link off (clicks still count; nothing new attaches) or back on */
	code: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const form = await request.formData();
		const code = String(form.get('code') ?? '');
		if (!/^[a-z0-9]{8}$/.test(code)) return fail(400, { message: 'Invalid code.' });
		const active = form.get('active') === 'yes';
		await db().from('referral_codes').update({ active }).eq('code', code);
		await logAdminAction(admin.id, active ? 'enable_referral_code' : 'disable_referral_code', code, null);
		return { done: `Code ${active ? 'enabled' : 'disabled'}.` };
	}
};
