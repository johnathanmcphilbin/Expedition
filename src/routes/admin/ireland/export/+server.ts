import type { RequestHandler } from './$types';
import { rowsToAttendCsv, type AttendCsvRow } from '$lib/ireland';
import { requireAdmin } from '$lib/server/guards';
import { listNotifyEmails, listSignups } from '$lib/server/ireland';

function cell(value: string): string {
	if (/^[=+\-@\t\r]/.test(value)) value = `'${value}`;
	if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
	return value;
}

export const GET: RequestHandler = async ({ locals, url }) => {
	requireAdmin(locals);

	if (url.searchParams.get('list') === 'notify') {
		const rows = await listNotifyEmails();
		const csv = '\uFEFF' + ['Email', ...rows.map((row) => cell(row.email))].join('\n') + '\n';
		return new Response(csv, {
			headers: {
				'content-type': 'text/csv; charset=utf-8',
				'content-disposition': 'attachment; filename="expedition-ireland-notify.csv"',
				'cache-control': 'private, no-store'
			}
		});
	}

	const signups = await listSignups();
	const approved: AttendCsvRow[] = signups
		.filter((row) => row.status === 'approved')
		.map((row) => ({
			name: row.name,
			email: row.email,
			age: row.age,
			school: row.school,
			county: row.county,
			github: row.github_username,
			builtNote: row.built_note,
			builtUrl: row.built_url,
			status: 'approved' as const
		}))
		.sort((a, b) => a.name.localeCompare(b.name, 'en'));

	return new Response('\uFEFF' + rowsToAttendCsv(approved), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': 'attachment; filename="expedition-ireland-approved.csv"',
			'cache-control': 'private, no-store'
		}
	});
};
