import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/guards';
import { db } from '$lib/server/supabase';
import { listAllClaims, fulfilClaim, cancelClaim } from '$lib/server/queries';
import { getShippingAddress } from '$lib/server/airtable';
import { text, uuid, ValidationError } from '$lib/server/validate';

const TABS = ['requested', 'fulfilled', 'cancelled'] as const;
type Tab = (typeof TABS)[number];

/** Rewards people have claimed from the shop, and getting them sent. */
export const load: PageServerLoad = async ({ locals, url }) => {
	requireAdmin(locals);

	const claims = await listAllClaims();
	const tab: Tab = TABS.find((t) => t === url.searchParams.get('status')) ?? 'requested';
	const shown = claims.filter((c) => c.status === tab);
	// oldest first while waiting, so nobody waits longest; newest first otherwise
	if (tab === 'requested') shown.reverse();

	// Each person's most recent Hack Club submission: the email they gave and
	// the record their shipping address lives on.
	const userIds = [...new Set(shown.map((c) => c.user_id))];
	const { data: subs } = userIds.length
		? await db()
				.from('hackclub_submissions')
				.select('user_id, email, airtable_record_id, airtable_created_at')
				.in('user_id', userIds)
				.order('airtable_created_at', { ascending: false })
		: { data: [] };
	const latest = new Map<string, { email: string | null; record: string }>();
	for (const s of subs ?? []) {
		if (s.user_id && !latest.has(s.user_id)) latest.set(s.user_id, { email: s.email, record: s.airtable_record_id });
	}

	// addresses only for what still needs posting
	const addresses = new Map<string, string[] | null>();
	if (tab === 'requested') {
		await Promise.all(
			userIds.map(async (id) => {
				const rec = latest.get(id)?.record;
				addresses.set(id, rec ? await getShippingAddress(rec).catch(() => null) : null);
			})
		);
	}

	return {
		tab,
		counts: Object.fromEntries(TABS.map((t) => [t, claims.filter((c) => c.status === t).length])) as Record<Tab, number>,
		claims: shown.map((c) => ({
			id: c.id,
			reward: c.reward_name,
			hours: Number(c.hours_cost),
			note: c.note,
			adminNotes: c.admin_notes,
			createdAt: c.created_at,
			fulfilledAt: c.fulfilled_at,
			name: c.owner?.display_name ?? 'Unknown',
			email: c.owner?.email ?? latest.get(c.user_id)?.email ?? null,
			address: addresses.get(c.user_id) ?? null,
			hasSubmission: latest.has(c.user_id)
		}))
	};
};

export const actions: Actions = {
	sent: async ({ request, locals }) => {
		requireAdmin(locals);
		const form = await request.formData();
		try {
			const id = uuid(form.get('claim_id')?.toString(), 'claim');
			await fulfilClaim(id, text(form.get('admin_notes'), 'Notes', { max: 500 }));
			return { done: 'sent' };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message });
			throw e;
		}
	},
	cancel: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const form = await request.formData();
		try {
			const id = uuid(form.get('claim_id')?.toString(), 'claim');
			const result = await cancelClaim(id, admin.id, text(form.get('admin_notes'), 'Notes', { max: 500 }));
			if (!result.ok) return fail(409, { message: result.message });
			return { done: 'cancelled' };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message });
			throw e;
		}
	}
};
