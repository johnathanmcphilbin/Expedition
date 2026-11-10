import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { saveMailingSignup } from '$lib/server/queries';
import { email as emailField, ValidationError } from '$lib/server/validate';

export const actions: Actions = {
	/**
	 * The hero form's real job is sending someone into Hack Club Auth — typing
	 * an email here doesn't log anyone in by itself (Hack Club Auth is OAuth;
	 * there's no password field to check). Capturing the address for the
	 * mailing list is a bonus side effect that must never block the redirect —
	 * a signup-save hiccup should never stop someone from being able to sign
	 * in.
	 */
	join: async ({ request }) => {
		const form = await request.formData();

		try {
			const address = emailField(form.get('email'), 'Email');
			try {
				await saveMailingSignup(address);
			} catch {
				// best-effort — sign-in still proceeds below
			}
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { message: e.message });
			throw e;
		}

		redirect(303, '/auth/login?next=%2Fonboarding');
	}
};
