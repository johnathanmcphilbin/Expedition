import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Referral logic with no database or framework in it, so it can be tested
 * on its own. The server wiring is in $lib/server/referrals.ts.
 */

export const CODE_RE = /^[a-z0-9]{8}$/;
export const isCode = (c: unknown): c is string => typeof c === 'string' && CODE_RE.test(c);

/** "ab12cd34.1730000000000.<sig>": the code, when it was clicked, and an HMAC so it can't be forged. */
export function signRef(code: string, clickedAt: number, secret: string): string {
	const body = `${code}.${clickedAt}`;
	return `${body}.${createHmac('sha256', secret).update(`ref:${body}`).digest('base64url')}`;
}

/** The click a cookie remembers, if it's genuine and still inside the window. */
export function readRef(
	value: string | undefined,
	secret: string,
	windowDays: number,
	now = Date.now()
): { code: string; clickedAt: number } | null {
	if (!value) return null;
	const parts = value.split('.');
	if (parts.length !== 3) return null;
	const [code, at, sig] = parts;
	if (!isCode(code) || !/^\d{10,16}$/.test(at)) return null;
	const expected = createHmac('sha256', secret).update(`ref:${code}.${at}`).digest('base64url');
	const a = Buffer.from(sig);
	const b = Buffer.from(expected);
	if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
	const clickedAt = Number(at);
	if (clickedAt > now + 60_000) return null; // from the future: not ours
	if (now - clickedAt > windowDays * 24 * 3600 * 1000) return null; // expired
	return { code, clickedAt };
}

/**
 * First touch wins: a still-valid remembered click is kept; only with none
 * (or an expired one) does a new click take over.
 */
export function chooseRef(
	existing: { code: string; clickedAt: number } | null,
	clicked: string,
	now = Date.now()
): { code: string; clickedAt: number; replaced: boolean } {
	if (existing) return { ...existing, replaced: false };
	return { code: clicked, clickedAt: now, replaced: true };
}

/** Same rule as the database's normalise_email: lower-case, no +tag, Gmail dots ignored. */
export function normaliseEmail(e: string | null | undefined): string | null {
	if (!e || !e.includes('@')) return null;
	const [local, domain] = e.toLowerCase().trim().split('@');
	const base = local.split('+')[0];
	if (domain === 'gmail.com' || domain === 'googlemail.com') return `${base.replace(/\./g, '')}@gmail.com`;
	return `${base}@${domain}`;
}

/** Two accounts that look like the same person (email or Slack ID). */
export function samePerson(
	a: { email: string | null; slack_id: string | null },
	b: { email: string | null; slack_id: string | null }
): boolean {
	const ea = normaliseEmail(a.email);
	if (ea && ea === normaliseEmail(b.email)) return true;
	return !!a.slack_id && a.slack_id === b.slack_id;
}

/**
 * The hours for the nth reward: the ledger keeps 2 decimals, so each payout
 * is the step between running totals, keeping the total exact to the cent.
 * Same arithmetic as the database's referral_pay_for_review.
 */
export function rewardHours(n: number, rewardCents: number, hourValueCents: number): number {
	const r2 = (x: number) => Math.round(x * 100) / 100;
	return r2(r2((n * rewardCents) / hourValueCents) - r2(((n - 1) * rewardCents) / hourValueCents));
}
