import type { PageServerLoad } from './$types';
import { requireUser } from '$lib/server/guards';
import { getBalance } from '$lib/server/queries';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals, '/claim');
	// Shown as context above the form, not sent to Airtable — claiming is a
	// request an admin reviews, not a self-service spend against the ledger.
	return { balance: await getBalance(user.id) };
};
