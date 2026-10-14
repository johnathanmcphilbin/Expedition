import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { db } from '$lib/server/supabase';
import { handleJoin, attachReferralOnSignup } from '$lib/server/referrals';
import { signRef } from '$lib/referrals/core';
import type { UserRow } from '$lib/server/database.types';

/**
 * Referral behaviour against a real database. Creates its own accounts
 * ("Referral Test …", hackclub_id test-ref-…, never real sign-ins, so every
 * count and report ignores them). Ledger history can't be deleted, so those
 * accounts stay; everything else is cleaned up.
 */
const RUN = process.env.RUN_DB_TESTS === '1';
const d = RUN ? describe : describe.skip;

const tag = randomBytes(3).toString('hex');
const SECRET = () => process.env.REFERRAL_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY!;

class Jar {
	store = new Map<string, string>();
	get = (n: string) => this.store.get(n);
	set = (n: string, v: string) => void this.store.set(n, v);
	delete = (n: string) => void this.store.delete(n);
	getAll = () => [...this.store].map(([name, value]) => ({ name, value }));
	serialize = () => '';
}
const jar = () => new Jar() as unknown as Cookies & Jar;

async function makeUser(name: string, extra: Partial<UserRow> = {}): Promise<UserRow> {
	const { data, error } = await db()
		.from('users')
		.insert({ hackclub_id: `test-ref-${tag}-${name}`, display_name: `Referral Test ${name} (permanent, harmless)`, email: `ref-${tag}-${name}@example.com`, ...extra })
		.select('*')
		.single();
	if (error) throw error;
	return data as UserRow;
}
const codeOf = async (id: string) => (await db().from('referral_codes').select('code').eq('user_id', id).single()).data!.code as string;

const records: string[] = [];
let n = 0;
/** a Hack Club submission + its pending review for `user`, on these Hackatime projects */
async function makeReview(user: UserRow, projects: string[]) {
	// Airtable-shaped: "rec" + 14 characters
	const rec = `recT${tag}${String(n++).padStart(7, '0')}`;
	records.push(rec);
	const hc = await db().from('hackclub_submissions').insert({ airtable_record_id: rec, user_id: user.id, project_names_raw: projects.join(', ') });
	if (hc.error) throw hc.error;
	const { data, error } = await db()
		.from('submission_reviews')
		.insert({ airtable_record_id: rec, user_id: user.id, hackatime_project: projects[0], hackatime_projects: projects, status: 'pending' })
		.select('id')
		.single();
	if (error) throw error;
	return { rec, id: data!.id as string };
}
const approve = (reviewId: string, reviewerId: string, hours: number) =>
	db().rpc('review_hackclub_submission', { p_review_id: reviewId, p_reviewer_id: reviewerId, p_status: 'approved', p_approved_hours: hours });
const rewardsFor = async (referredId: string) =>
	(await db().from('referral_rewards').select('*').eq('referred_id', referredId).order('created_at')).data ?? [];
const ledger = async (userId: string, type: 'checkpoint_approved' | 'referral_reward' | 'referral_reversal') =>
	(await db().from('hour_transactions').select('amount, referral_reward_id').eq('user_id', userId).eq('type', type)).data ?? [];

/** a fresh builder referred by `by`, attached the way sign-up does it */
async function referredBuilder(name: string, by: UserRow, code: string) {
	const u = await makeUser(name);
	const { error } = await db().from('referral_attributions').insert({ referred_id: u.id, referrer_id: by.id, code });
	if (error) throw error;
	return u;
}

let admin: UserRow;
let referrer: UserRow, sam: UserRow, other: UserRow;
let refCode: string;

d('referrals (database)', () => {
	beforeAll(async () => {
		admin = (await db().from('users').select('*').eq('role', 'admin').limit(1).single()).data as UserRow;
		referrer = await makeUser('referrer');
		other = await makeUser('other');
		refCode = await codeOf(referrer.id);
	});

	afterAll(async () => {
		if (records.length) await db().from('hackclub_submissions').delete().in('airtable_record_id', records);
		await db().from('review_flags').delete().like('item_key', `recT${tag}%`);
		await db().from('users').update({ role: 'participant' }).like('hackclub_id', `test-ref-${tag}-%`);
	});

	it('every account gets a code, including existing ones (migration backfill)', async () => {
		expect(refCode).toMatch(/^[a-z0-9]{8}$/);
		const { count: users } = await db().from('users').select('*', { count: 'exact', head: true });
		const { count: codes } = await db().from('referral_codes').select('*', { count: 'exact', head: true });
		expect(codes).toBe(users);
	});

	it('a click is counted and remembered; first touch wins over a second link', async () => {
		const c = jar();
		const before = (await db().from('referral_events').select('*', { count: 'exact', head: true }).eq('code', refCode).eq('type', 'click')).count ?? 0;
		expect((await handleJoin(c, null, refCode)).valid).toBe(true);
		const first = c.get('exp_ref');
		await handleJoin(c, null, await codeOf(other.id));
		expect(c.get('exp_ref')).toBe(first);
		const after = (await db().from('referral_events').select('*', { count: 'exact', head: true }).eq('code', refCode).eq('type', 'click')).count ?? 0;
		expect(after).toBe(before + 1);
	});

	it('someone already in Expedition: click counts, nothing is remembered', async () => {
		const c = jar();
		const out = await handleJoin(c, other, refCode);
		expect(out.enrolled).toBe(true);
		expect(c.get('exp_ref')).toBeUndefined();
	});

	it('a new account made through the link is attached (code survives sign-in)', async () => {
		const c = jar();
		await handleJoin(c, null, refCode);
		sam = await makeUser('sam');
		await attachReferralOnSignup(c, sam);
		const { data } = await db().from('referral_attributions').select('*').eq('referred_id', sam.id).single();
		expect(data?.referrer_id).toBe(referrer.id);
		expect(data?.status).toBe('active');
		expect(c.get('exp_ref')).toBeUndefined();
	});

	it('the referrer never changes, even through another link', async () => {
		const c = jar();
		c.set('exp_ref', signRef(await codeOf(other.id), Date.now(), SECRET()));
		await attachReferralOnSignup(c, sam);
		const { data } = await db().from('referral_attributions').select('referrer_id').eq('referred_id', sam.id).single();
		expect(data!.referrer_id).toBe(referrer.id);
	});

	it('self-referral, expired clicks and disabled codes attach nothing', async () => {
		const self = jar();
		self.set('exp_ref', signRef(await codeOf(other.id), Date.now(), SECRET()));
		await attachReferralOnSignup(self, other);
		const expired = jar();
		const late = await makeUser('late');
		expired.set('exp_ref', signRef(refCode, Date.now() - 31 * 24 * 3600 * 1000, SECRET()));
		await attachReferralOnSignup(expired, late);
		const disabled = await makeUser('disabled-ref');
		await db().from('referral_codes').update({ active: false }).eq('user_id', disabled.id);
		const viaDisabled = jar();
		viaDisabled.set('exp_ref', signRef(await codeOf(disabled.id), Date.now(), SECRET()));
		const nobody = await makeUser('nobody');
		await attachReferralOnSignup(viaDisabled, nobody);
		const { data } = await db().from('referral_attributions').select('referred_id').in('referred_id', [other.id, late.id, nobody.id]);
		expect(data).toEqual([]);
		// and the database itself refuses a self-referral
		const { error } = await db().from('referral_attributions').insert({ referred_id: other.id, referrer_id: other.id, code: await codeOf(other.id) });
		expect(error).not.toBeNull();
	});

	it('same email (Gmail dots / +tags) as the referrer is held for an admin', async () => {
		const twin = jar();
		await handleJoin(twin, null, refCode);
		const r2 = await makeUser('twin', { email: referrer.email!.replace('@', '+alt@') });
		await attachReferralOnSignup(twin, r2);
		const { data } = await db().from('referral_attributions').select('status, flag').eq('referred_id', r2.id).single();
		expect(data!.status).toBe('held');
	});

	it('under the minimum approved hours pays nothing; the first approval at the minimum pays $2', async () => {
		const small = await makeReview(sam, ['alpha']);
		expect((await approve(small.id, admin.id, 1.5)).error).toBeNull();
		expect(await rewardsFor(sam.id)).toHaveLength(0);
		const ok = await makeReview(sam, ['beta']);
		expect((await approve(ok.id, admin.id, 2)).error).toBeNull();
		const rw = await rewardsFor(sam.id);
		expect(rw).toHaveLength(1);
		expect(rw[0].amount_cents).toBe(200);
		expect(Number(rw[0].hours)).toBe(0.25); // $2 at $8/h
	});

	it('once per friend: later approvals (same or different project) pay nothing more', async () => {
		const again = await makeReview(sam, ['beta']);
		await approve(again.id, admin.id, 3);
		const fresh = await makeReview(sam, ['delta']);
		await approve(fresh.id, admin.id, 5);
		expect(await rewardsFor(sam.id)).toHaveLength(1);
		const credit = (await ledger(referrer.id, 'referral_reward')).reduce((t, r) => t + Number(r.amount), 0);
		expect(Math.round(credit * 100) / 100).toBe(0.25);
	});

	it('approving an approved review again is refused (no second reward)', async () => {
		const rw = await rewardsFor(sam.id);
		const { error } = await approve(rw[0].review_id, admin.id, 9);
		expect(error?.message).toMatch(/already approved/);
		expect(await rewardsFor(sam.id)).toHaveLength(1);
	});

	it('pays exactly once under parallel calls, simultaneous approvals and repeated reconciles', async () => {
		const ana = await referredBuilder('ana', referrer, refCode);
		const r1 = await makeReview(ana, ['one']);
		const r2 = await makeReview(ana, ['two']);
		// two of her projects approved at the same moment, plus payout calls and reconciles racing them
		await Promise.all([
			approve(r1.id, admin.id, 3),
			approve(r2.id, admin.id, 4),
			...Array.from({ length: 6 }, (_, i) => db().rpc('referral_pay_for_review', { p_review_id: i % 2 ? r1.id : r2.id })),
			db().rpc('referral_reconcile'),
			db().rpc('referral_reconcile')
		]);
		await db().rpc('referral_reconcile');
		const rw = await rewardsFor(ana.id);
		expect(rw).toHaveLength(1);
		const rows = (await ledger(referrer.id, 'referral_reward')).filter((l) => l.referral_reward_id === rw[0].id);
		expect(rows).toHaveLength(1);
	});

	it('pending, rejected and flagged work never pays', async () => {
		const ben = await referredBuilder('ben', referrer, refCode);
		const pending = await makeReview(ben, ['zeta']);
		expect((await db().rpc('referral_pay_for_review', { p_review_id: pending.id })).data).toBe('not approved');
		const rejected = await makeReview(ben, ['eta']);
		await db().rpc('review_hackclub_submission', { p_review_id: rejected.id, p_reviewer_id: admin.id, p_status: 'rejected' });
		expect((await db().rpc('referral_pay_for_review', { p_review_id: rejected.id })).data).toBe('not approved');
		const flagged = await makeReview(ben, ['theta']);
		await db().from('review_flags').insert({ item_kind: 'hc', item_key: flagged.rec, reason: 'test' });
		await approve(flagged.id, admin.id, 3);
		expect(await rewardsFor(ben.id)).toHaveLength(0);
	});

	it('a held referral waits; releasing it and reconciling pays', async () => {
		const cal = await referredBuilder('cal', referrer, refCode);
		await db().from('referral_attributions').update({ status: 'held' }).eq('referred_id', cal.id);
		const r = await makeReview(cal, ['iota']);
		await approve(r.id, admin.id, 3);
		expect(await rewardsFor(cal.id)).toHaveLength(0);
		await db().from('referral_attributions').update({ status: 'active' }).eq('referred_id', cal.id);
		await db().rpc('referral_reconcile');
		expect(await rewardsFor(cal.id)).toHaveLength(1);
	});

	it('reversal adds a negative row and keeps the original', async () => {
		const [first] = await rewardsFor(sam.id);
		expect((await db().rpc('referral_reverse', { p_reward_id: first.id, p_admin_id: admin.id, p_note: 'test reversal' })).data).toBe(true);
		expect((await db().rpc('referral_reverse', { p_reward_id: first.id, p_admin_id: admin.id, p_note: 'again' })).data).toBe(false);
		const plus = (await ledger(referrer.id, 'referral_reward')).filter((l) => l.referral_reward_id === first.id);
		const minus = (await ledger(referrer.id, 'referral_reversal')).filter((l) => l.referral_reward_id === first.id);
		expect(plus).toHaveLength(1);
		expect(minus).toHaveLength(1);
		expect(Number(minus[0].amount)).toBe(-Number(plus[0].amount));
		const { data } = await db().from('referral_rewards').select('status').eq('id', first.id).single();
		expect(data!.status).toBe('reversed');
	});

	it("referral credit never changes anyone's approved build hours", async () => {
		const { data: refProgress } = await db().from('user_expedition_progress').select('hours_earned').eq('user_id', referrer.id).maybeSingle();
		expect(Number(refProgress?.hours_earned ?? 0)).toBe(0);
		const approvedRows = await ledger(sam.id, 'checkpoint_approved');
		const { data: samProgress } = await db().from('user_expedition_progress').select('hours_earned').eq('user_id', sam.id).single();
		expect(Number(samProgress!.hours_earned)).toBe(approvedRows.reduce((t, r) => t + Number(r.amount), 0));
	});

	it('a reviewer cannot decide work by someone they referred', async () => {
		await db().from('users').update({ role: 'reviewer' }).eq('id', referrer.id);
		const r = await makeReview(sam, ['kappa']);
		const { error } = await approve(r.id, referrer.id, 2);
		expect(error?.message).toMatch(/someone you referred/);
	});
});
