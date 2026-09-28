import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/guards';
import { listForModeration, moderate } from '$lib/server/checkpoints';
import { uuid, oneOf, ValidationError } from '$lib/server/validate';

export const load: PageServerLoad = async ({ locals, url }) => {
	requireAdmin(locals);
	const all = await listForModeration();
	const tab = (['waiting', 'shown', 'hidden'] as const).find((t) => t === url.searchParams.get('status')) ?? 'waiting';
	return {
		tab,
		counts: {
			waiting: all.filter((c) => c.visibility === 'waiting').length,
			shown: all.filter((c) => c.visibility === 'shown').length,
			hidden: all.filter((c) => c.visibility === 'hidden').length
		},
		items: all.filter((c) => c.visibility === tab)
	};
};

export const actions: Actions = {
	moderate: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const form = await request.formData();
		try {
			const id = uuid(form.get('id')?.toString(), 'checkpoint');
			const to = oneOf(form.get('to'), ['shown', 'hidden'] as const, 'Decision');
			await moderate(id, admin.id, to);
			return { done: true };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message });
			throw e;
		}
	}
};
