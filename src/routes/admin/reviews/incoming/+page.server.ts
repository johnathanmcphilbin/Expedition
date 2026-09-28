import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Reviews live on one page now; keep old links working.
export const load: PageServerLoad = ({ url }) => {
	const qs = new URLSearchParams(url.searchParams);
	const id = qs.get('id');
	qs.delete('id');
	if (id) qs.set('new', id);
	if (qs.get('status') === 'sent') qs.set('status', 'approved');
	redirect(308, `/admin/reviews${qs.toString() ? `?${qs}` : ''}`);
};
