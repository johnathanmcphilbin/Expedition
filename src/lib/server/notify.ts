import { env } from '$env/dynamic/private';

/**
 * Email the organisers when something needs their attention. Always
 * best-effort: a notification that fails is logged and dropped, it must
 * never fail the claim or submission that triggered it.
 *
 * Sent through Resend's HTTP API. `onboarding@resend.dev` only delivers to
 * the address that owns the Resend account, which is fine for a single
 * organiser inbox; set NOTIFY_FROM once a sending domain is verified.
 */

const TO = () => env.NOTIFY_EMAIL?.trim() || 'johnny@hackclub.com';
const FROM = () => env.NOTIFY_FROM?.trim() || 'Expedition <onboarding@resend.dev>';
const SITE = 'https://expedition.hackclub.com';

function esc(s: string | null | undefined): string {
	return (s ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

async function send(subject: string, rows: [string, string | null | undefined][], link: string) {
	const key = env.RESEND_API_KEY?.trim();
	if (!key) {
		console.warn('notify: RESEND_API_KEY not set, skipping:', subject);
		return;
	}

	const present = rows.filter(([, v]) => v);
	const html = `
		<div style="font-family:system-ui,sans-serif;font-size:15px;color:#1d2b41">
			<h2 style="margin:0 0 12px">${esc(subject)}</h2>
			<table style="border-collapse:collapse">
				${present
					.map(
						([k, v]) =>
							`<tr><td style="padding:4px 16px 4px 0;color:#66748a;vertical-align:top">${esc(k)}</td><td style="padding:4px 0;white-space:pre-wrap">${esc(v)}</td></tr>`
					)
					.join('')}
			</table>
			<p style="margin:18px 0 0"><a href="${esc(link)}">Open in Expedition</a></p>
		</div>`;
	const text = `${subject}\n\n${present.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${link}`;

	try {
		const res = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
			signal: AbortSignal.timeout(5000),
			body: JSON.stringify({ from: FROM(), to: [TO()], subject, html, text })
		});
		if (!res.ok) console.error('notify: resend rejected', res.status, (await res.text()).slice(0, 300));
	} catch (e) {
		console.error('notify: send failed', e);
	}
}

export function notifySubmission(s: {
	name: string;
	email: string;
	project: string;
	codeUrl: string;
	playableUrl: string;
	description: string;
}) {
	return send(
		`New submission: ${s.project}`,
		[
			['From', `${s.name} (${s.email})`],
			['Project', s.project],
			['Code', s.codeUrl],
			['Demo', s.playableUrl],
			['Description', s.description]
		],
		`${SITE}/admin/reviews`
	);
}

export function notifyClaim(c: { name: string | null; reward: string; hours: number; note: string | null }) {
	return send(
		`New claim: ${c.reward}`,
		[
			['From', c.name ?? 'Unnamed participant'],
			['Reward', c.reward],
			['Hours', `${c.hours}h`],
			['Note', c.note]
		],
		`${SITE}/admin`
	);
}
