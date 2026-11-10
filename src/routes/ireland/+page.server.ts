import { fail, type Cookies } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { DEFAULT_CAPACITY, publicStatus, tooFast } from '$lib/ireland';
import { FORM_COOKIE, createSignup, publicIreland, saveNotifyEmail } from '$lib/server/ireland';

function rememberForm(cookies: Cookies, url: URL) {
	cookies.set(FORM_COOKIE, String(Date.now()), {
		path: '/ireland',
		httpOnly: true,
		sameSite: 'lax',
		secure: url.protocol === 'https:',
		maxAge: 60 * 60 * 12
	});
}

export const load: PageServerLoad = async ({ cookies, setHeaders, url }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	rememberForm(cookies, url);
	try {
		return { ireland: await publicIreland() };
	} catch {
		return { ireland: publicStatus({ open: false, capacity: DEFAULT_CAPACITY, holding: 0 }) };
	}
};

function text(form: FormData, name: string): string {
	const value = form.get(name);
	return typeof value === 'string' ? value : '';
}

function address(getClientAddress: () => string): string | null {
	try {
		return getClientAddress();
	} catch {
		return null;
	}
}

export const actions: Actions = {
	signup: async ({ request, cookies, getClientAddress }) => {
		const form = await request.formData();
		const fields = {
			name: text(form, 'name'),
			email: text(form, 'email'),
			age: text(form, 'age'),
			school: text(form, 'school'),
			county: text(form, 'county'),
			github: text(form, 'github'),
			built: text(form, 'built'),
			built_url: text(form, 'built_url'),
			hp: text(form, 'hp')
		};
		const back = { ...fields, hp: '' };
		if (tooFast(cookies.get(FORM_COOKIE), Date.now())) {
			return fail(400, { ...back, message: 'That was too fast. Wait a second and try again.' });
		}
		try {
			const result = await createSignup(fields, address(getClientAddress));
			if (result.ok && result.honeypot) return { ok: true as const, kind: 'pending' as const };
			if (result.ok) return { ok: true as const, kind: result.status };
			const status = result.error === 'rate' ? 429 : result.error === 'closed' ? 403 : 400;
			return fail(status, { ...back, message: result.message });
		} catch {
			return fail(500, { ...back, message: 'Something went wrong saving that. Try again in a minute.' });
		}
	},

	notify: async ({ request, cookies, getClientAddress }) => {
		const form = await request.formData();
		const fields = { email: text(form, 'email'), hp: text(form, 'hp') };
		if (tooFast(cookies.get(FORM_COOKIE), Date.now())) {
			return fail(400, { email: fields.email, message: 'That was too fast. Wait a second and try again.' });
		}
		try {
			const result = await saveNotifyEmail(fields, address(getClientAddress));
			if (result.ok) return { ok: true as const, kind: 'notify' as const };
			const status = result.error === 'rate' ? 429 : 400;
			return fail(status, { email: fields.email, message: result.message });
		} catch {
			return fail(500, { email: fields.email, message: 'Something went wrong saving that. Try again in a minute.' });
		}
	}
};
