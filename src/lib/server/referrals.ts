import { createHash, randomBytes } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { db } from './supabase';
import { config } from './env';
import { env } from '$env/dynamic/private';
import type { UserRow } from './database.types';
import { isCode, readRef, signRef, chooseRef, samePerson } from '$lib/referrals/core';

/**
 * Referrals: /join?ref=CODE remembers the click (first touch, 30 days), the
 * code is attached only when that person's Expedition account is created,
 * and the database pays the referrer when their friend's projects are
 * approved (referral_pay_for_review, called inside the approval itself).
 */

const REF_COOKIE = 'exp_ref';
const VISITOR_COOKIE = 'exp_vid';

export type ReferralConfig = {
	reward_cents: number;
	min_approved_hours: number;
	hour_value_cents: number;
	budget_cents_per_hour: number;
	window_days: number;
	active: boolean;
};

const FALLBACK: ReferralConfig = {
	reward_cents: 100,
	min_approved_hours: 2,
	hour_value_cents: 800,
	budget_cents_per_hour: 850,
	window_days: 30,
	active: true
};

export async function getReferralConfig(): Promise<ReferralConfig> {
	const { data } = await db().from('referral_config').select('*').maybeSingle();
	return data ? { ...FALLBACK, ...(data as Partial<ReferralConfig>), min_approved_hours: Number(data.min_approved_hours) } : FALLBACK;
}

// the cookie is signed so a code can't be planted; any server secret will do
const secret = () => env.REFERRAL_SECRET?.trim() || config.supabase.serviceRoleKey;

const cookieOpts = (days: number) => ({
	path: '/',
	httpOnly: true,
	sameSite: 'lax' as const,
	secure: process.env.NODE_ENV === 'production',
	maxAge: days * 24 * 3600
});

/** A random id per browser, stored only as a hash, for approximate unique visitors. */
function visitorHash(cookies: Cookies): string {
	let v = cookies.get(VISITOR_COOKIE);
	if (!v || !/^[A-Za-z0-9_-]{16,64}$/.test(v)) {
		v = randomBytes(16).toString('base64url');
		cookies.set(VISITOR_COOKIE, v, cookieOpts(365));
	}
	return createHash('sha256').update(`visitor:${v}`).digest('hex').slice(0, 32);
}

export type JoinOutcome = {
	valid: boolean;
	/** first name of whoever's link it is, for the landing page */
	referrer: string | null;
	/** already in Expedition: counted, but nothing to attach */
	enrolled: boolean;
};

/**
 * Someone opened /join?ref=CODE. Always count the click; remember the code
 * for 30 days unless they're already in Expedition or an earlier valid
 * click is still remembered (first touch wins).
 */
export async function handleJoin(cookies: Cookies, user: UserRow | null, code: string | null): Promise<JoinOutcome> {
	if (!isCode(code)) return { valid: false, referrer: null, enrolled: !!user };
	const cfg = await getReferralConfig();
	const { data: owner } = await db()
		.from('referral_codes')
		.select('code, active, user_id, users(display_name)')
		.eq('code', code)
		.maybeSingle();
	if (!owner) return { valid: false, referrer: null, enrolled: !!user };
	const name = ((owner as unknown as { users: { display_name: string | null } | null }).users?.display_name ?? '').split(' ')[0] || null;

	await db().from('referral_events').insert({ code, type: 'click', visitor_hash: visitorHash(cookies) });

	// a disabled code or a paused program still counts the click, nothing more
	if (!owner.active || !cfg.active) return { valid: false, referrer: name, enrolled: !!user };
	// Case C/F: already in Expedition (being signed in here means having an account)
	if (user) return { valid: true, referrer: name, enrolled: true };

	const kept = readRef(cookies.get(REF_COOKIE), secret(), cfg.window_days);
	const choice = chooseRef(kept, code);
	if (choice.replaced) cookies.set(REF_COOKIE, signRef(choice.code, choice.clickedAt, secret()), cookieOpts(cfg.window_days));
	return { valid: true, referrer: name, enrolled: false };
}

/**
 * Called once, right after a brand-new Expedition account is inserted.
 * Attaches the remembered referral if it's still valid. Never throws:
 * sign-in must not fail over a referral.
 */
export async function attachReferralOnSignup(cookies: Cookies, newUser: UserRow): Promise<void> {
	try {
		const cfg = await getReferralConfig();
		const ref = readRef(cookies.get(REF_COOKIE), secret(), cfg.window_days);
		cookies.delete(REF_COOKIE, { path: '/' });
		if (!ref || !cfg.active) return;

		const { data: code } = await db().from('referral_codes').select('code, active, user_id').eq('code', ref.code).maybeSingle();
		if (!code || !code.active || code.user_id === newUser.id) return;

		const { data: referrer } = await db().from('users').select('email, slack_id').eq('id', code.user_id).maybeSingle();
		const same = referrer ? samePerson(referrer, newUser) : false;

		const { error } = await db()
			.from('referral_attributions')
			.insert({
				referred_id: newUser.id,
				referrer_id: code.user_id,
				code: code.code,
				clicked_at: new Date(ref.clickedAt).toISOString(),
				...(same ? { status: 'held', flag: 'same email or Slack ID as referrer' } : {})
			});
		if (error) {
			// 23505: they already have a referrer, which never changes
			if (error.code !== '23505') console.error('attachReferralOnSignup', error.message);
			return;
		}
		await db().from('referral_events').insert({ code: code.code, type: 'signup' });
	} catch (e) {
		console.error('attachReferralOnSignup', e);
	}
}

/** True when this reviewer referred this builder (they can't review their work). */
export async function referredBy(reviewerId: string, ownerId: string): Promise<boolean> {
	const { data } = await db()
		.from('referral_attributions')
		.select('referred_id')
		.eq('referred_id', ownerId)
		.eq('referrer_id', reviewerId)
		.maybeSingle();
	return !!data;
}

// ------------------------------------------------------------------ stats

type Funnel = {
	clicks: number;
	uniqueVisitors: number;
	/** attributed accounts that have connected Hackatime */
	joined: number;
	/** of those, people who've submitted a project */
	active: number;
	approvedBuilders: number;
	approvedProjects: number;
	creditCents: number;
};

async function funnelFor(codes: string[], referredIds: string[], rewards: { referred_id: string; amount_cents: number; status: string }[]): Promise<Funnel> {
	const [clicks, connected, queued, hc] = await Promise.all([
		codes.length ? db().from('referral_events').select('visitor_hash').in('code', codes).eq('type', 'click') : Promise.resolve({ data: [] }),
		referredIds.length ? db().from('hackatime_connections').select('user_id').in('user_id', referredIds) : Promise.resolve({ data: [] }),
		referredIds.length ? db().from('submission_queue').select('user_id').in('user_id', referredIds) : Promise.resolve({ data: [] }),
		referredIds.length ? db().from('hackclub_submissions').select('user_id').in('user_id', referredIds) : Promise.resolve({ data: [] })
	]);
	const joinedSet = new Set((connected.data ?? []).map((r) => r.user_id as string));
	const submitted = new Set([...(queued.data ?? []), ...(hc.data ?? [])].map((r) => r.user_id as string));
	const earned = rewards.filter((r) => r.status === 'earned');
	const clickRows = (clicks.data ?? []) as { visitor_hash: string | null }[];
	return {
		clicks: clickRows.length,
		uniqueVisitors: new Set(clickRows.map((c) => c.visitor_hash).filter(Boolean)).size,
		joined: joinedSet.size,
		active: [...joinedSet].filter((id) => submitted.has(id)).length,
		approvedBuilders: new Set(earned.map((r) => r.referred_id)).size,
		approvedProjects: earned.length,
		creditCents: earned.reduce((t, r) => t + r.amount_cents, 0)
	};
}

/** What a participant sees about their own link. No names or emails of the people they referred. */
export async function myReferrals(userId: string) {
	const cfg = await getReferralConfig();
	const { data: code } = await db().from('referral_codes').select('code, active').eq('user_id', userId).maybeSingle();
	const [attr, rewards] = await Promise.all([
		db().from('referral_attributions').select('referred_id, status').eq('referrer_id', userId),
		db().from('referral_rewards').select('referred_id, amount_cents, status').eq('referrer_id', userId)
	]);
	const referred = (attr.data ?? []).filter((a) => a.status !== 'rejected').map((a) => a.referred_id as string);
	return {
		code: code?.code ?? null,
		active: !!code?.active && cfg.active,
		rewardCents: cfg.reward_cents,
		minHours: cfg.min_approved_hours,
		funnel: await funnelFor(code ? [code.code] : [], referred, (rewards.data ?? []) as { referred_id: string; amount_cents: number; status: string }[])
	};
}

/** Everything the admin referrals page needs. */
export async function referralAdmin() {
	const cfg = await getReferralConfig();
	const [codes, attrs, rewards, users, approvedHours, reviewPay, audit] = await Promise.all([
		db().from('referral_codes').select('code, user_id, active'),
		db().from('referral_attributions').select('*'),
		db().from('referral_rewards').select('*').order('created_at', { ascending: false }),
		db().from('users').select('id, display_name, email, created_at, hackclub_id'),
		db().from('hour_transactions').select('amount, user_id').eq('type', 'checkpoint_approved'),
		db().from('review_payouts').select('amount, reviewer_id'),
		db().from('admin_actions').select('*').order('created_at', { ascending: false }).limit(30)
	]);
	// real Hack Club sign-ins only: test accounts never show up in the numbers
	const real = new Set((users.data ?? []).filter((u) => u.hackclub_id?.startsWith('ident!')).map((u) => u.id));
	const userBy = new Map((users.data ?? []).map((u) => [u.id, u]));
	const allCodes = (codes.data ?? []).filter((c) => real.has(c.user_id)).map((c) => c.code);
	const allAttr = ((attrs.data ?? []) as { referred_id: string; referrer_id: string }[]).filter((a) => real.has(a.referred_id) && real.has(a.referrer_id)) as {
		referred_id: string;
		referrer_id: string;
		code: string;
		status: string;
		flag: string | null;
		attributed_at: string;
		clicked_at: string | null;
	}[];
	const allRewards = ((rewards.data ?? []) as { referred_id: string; referrer_id: string }[]).filter((r) => real.has(r.referred_id) && real.has(r.referrer_id)) as {
		id: string;
		referrer_id: string;
		referred_id: string;
		project_names: string[];
		approved_hours: number;
		amount_cents: number;
		hours: number;
		status: string;
		note: string | null;
		created_at: string;
	}[];
	const totals = await funnelFor(
		allCodes,
		allAttr.filter((a) => a.status !== 'rejected').map((a) => a.referred_id),
		allRewards
	);

	// ---- budget: $8.50 per approved hour, against what's been promised out of it
	const hours = (approvedHours.data ?? []).filter((r) => real.has(r.user_id)).reduce((t, r) => t + Number(r.amount), 0);
	const reviewPayHours = (reviewPay.data ?? []).filter((r) => real.has(r.reviewer_id)).reduce((t, r) => t + Number(r.amount ?? 0), 0);
	const gross = Math.round(hours * cfg.budget_cents_per_hour);
	const participants = Math.round(hours * cfg.hour_value_cents);
	const reviewers = Math.round(reviewPayHours * cfg.hour_value_cents);
	const referrals = totals.creditCents;
	const budget = {
		approvedHours: Math.round(hours * 100) / 100,
		grossCents: gross,
		participantCents: participants,
		reviewerCents: reviewers,
		referralCents: referrals,
		remainingCents: gross - participants - reviewers - referrals,
		referralPctOfBudget: gross ? Math.round((referrals / gross) * 1000) / 10 : 0
	};

	// ---- per referrer
	const codeOf = new Map((codes.data ?? []).filter((c) => real.has(c.user_id)).map((c) => [c.user_id, c]));
	const referrerIds = [...new Set([...allAttr.map((a) => a.referrer_id), ...allRewards.map((r) => r.referrer_id)])];
	const realCodes = new Set(allCodes);
	const { data: clickRows } = allCodes.length
		? await db().from('referral_events').select('code, type')
		: { data: [] };
	const clicksBy = new Map<string, number>();
	for (const e of clickRows ?? []) if (e.type === 'click' && realCodes.has(e.code)) clicksBy.set(e.code, (clicksBy.get(e.code) ?? 0) + 1);
	const firstName = (id: string) => (userBy.get(id)?.display_name ?? 'Unnamed').split(' ')[0];

	const referrers = referrerIds
		.map((id) => {
			const mine = allAttr.filter((a) => a.referrer_id === id);
			const paid = allRewards.filter((r) => r.referrer_id === id);
			const code = codeOf.get(id);
			return {
				id,
				name: userBy.get(id)?.display_name ?? 'Unnamed',
				email: userBy.get(id)?.email ?? null,
				code: code?.code ?? null,
				codeActive: code?.active ?? false,
				clicks: code ? (clicksBy.get(code.code) ?? 0) : 0,
				referred: mine.map((a) => ({
					id: a.referred_id,
					name: firstName(a.referred_id),
					status: a.status,
					flag: a.flag,
					joinedAt: a.attributed_at,
					rewards: paid.filter((r) => r.referred_id === a.referred_id)
				})),
				approvedProjects: paid.filter((r) => r.status === 'earned').length,
				approvedBuilders: new Set(paid.filter((r) => r.status === 'earned').map((r) => r.referred_id)).size,
				creditCents: paid.filter((r) => r.status === 'earned').reduce((t, r) => t + r.amount_cents, 0)
			};
		})
		.sort((a, b) => b.approvedProjects - a.approvedProjects || b.approvedBuilders - a.approvedBuilders || b.referred.length - a.referred.length);

	// top codes by clicks even with no sign-ups yet
	const clickOnly = [...clicksBy.entries()]
		.filter(([code]) => !referrers.some((r) => r.code === code))
		.map(([code, n]) => {
			const owner = (codes.data ?? []).find((c) => c.code === code);
			return { code, clicks: n, name: owner ? (userBy.get(owner.user_id)?.display_name ?? 'Unnamed') : 'Unknown' };
		})
		.sort((a, b) => b.clicks - a.clicks)
		.slice(0, 10);

	return {
		config: cfg,
		totals: { ...totals, attributed: allAttr.filter((a) => a.status !== 'rejected').length, held: allAttr.filter((a) => a.status === 'held').length },
		budget,
		referrers,
		clickOnly,
		audit: (audit.data ?? []).map((a) => ({ ...a, admin: a.admin_id ? (userBy.get(a.admin_id)?.display_name ?? 'Admin') : 'System' }))
	};
}

export async function logAdminAction(adminId: string, action: string, target: string, note: string | null) {
	await db().from('admin_actions').insert({ admin_id: adminId, action, target, note });
}
