import type { PageServerLoad } from './$types';
import { requireUser } from '$lib/server/guards';
import { getBalance, listTransactions } from '$lib/server/queries';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals, '/your-hours');
	const [balance, transactions] = await Promise.all([
		getBalance(user.id),
		listTransactions(user.id)
	]);
	return { balance, transactions };
};
