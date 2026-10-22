import { db } from './supabase';
import { reviewerName } from './guards';
import type { UserRow } from './database.types';

/**
 * Claiming a submission before reviewing it, so two reviewers never work on
 * the same one. Non-admin reviewers can only edit or decide a waiting
 * submission they hold the claim on; admins can review anything, and can
 * release anyone's claim. Saving (autosave included) keeps a claim alive;
 * one left alone for CLAIM_HOURS lapses and anyone can take it.
 *
 * Sending a submission back for changes holds the claim for whoever decided
 * it, with no expiry, so the resubmission comes back to them. Once it's
 * resubmitted they have RESUBMIT_HOURS to pick it up before it's free.
 */
export const CLAIM_HOURS = 2;
export const RESUBMIT_HOURS = 24;
/** Claims one reviewer can be working on at once (held ones don't count), so nobody sits on the queue. */
export const MAX_CLAIMS = 3;

export type Kind = 'hc' | 'new';
export type Claim = { kind: Kind; key: string; reviewerId: string; by: string; claimedAt: string; held: boolean };

const inHours = (h: number) => new Date(Date.now() + h * 60 * 60 * 1000).toISOString();
// live: held (no expiry) or not yet lapsed
const LIVE = () => `expires_at.is.null,expires_at.gt.${new Date().toISOString()}`;

/** Every live claim, with who holds it. */
export async function listClaims(): Promise<Claim[]> {
	const { data } = await db()
		.from('review_claims')
		.select('item_kind, item_key, reviewer_id, claimed_at, held, users!reviewer_id(*)')
		.or(LIVE())
		.order('claimed_at', { ascending: true });
	return (data ?? []).map((c) => ({
		kind: c.item_kind as Kind,
		key: c.item_key,
		reviewerId: c.reviewer_id,
		by: c.users ? reviewerName(c.users as unknown as UserRow) : 'a reviewer',
		claimedAt: c.claimed_at,
		held: c.held
	}));
}

/** Take a submission. Null when it's theirs now, else why not. */
export async function claim(reviewer: UserRow, kind: Kind, key: string): Promise<string | null> {
	// a lapsed claim is free for anyone
	await db().from('review_claims').delete().eq('item_kind', kind).eq('item_key', key).lt('expires_at', new Date().toISOString());

	const { data: mine } = await db()
		.from('review_claims')
		.select('item_kind, item_key, held')
		.eq('reviewer_id', reviewer.id)
		.or(LIVE());
	if ((mine ?? []).some((c) => c.item_kind === kind && c.item_key === key)) return null;
	if (reviewer.role !== 'admin' && (mine ?? []).filter((c) => !c.held).length >= MAX_CLAIMS) {
		return `You're already working on ${MAX_CLAIMS}. Finish or release one first.`;
	}

	// the primary key decides a race: only one insert wins
	const { data: won } = await db()
		.from('review_claims')
		.upsert(
			{ item_kind: kind, item_key: key, reviewer_id: reviewer.id, claimed_at: new Date().toISOString(), expires_at: inHours(CLAIM_HOURS), held: false },
			{ onConflict: 'item_kind,item_key', ignoreDuplicates: true }
		)
		.select('item_key');
	if (won?.length) return null;
	const holder = (await listClaims()).find((c) => c.kind === kind && c.key === key);
	return `${holder?.by ?? 'Someone else'} has already claimed this one.`;
}

/** Let go of a claim: their own, or anyone's for an admin. */
export async function release(user: UserRow, kind: Kind, key: string): Promise<void> {
	let q = db().from('review_claims').delete().eq('item_kind', kind).eq('item_key', key);
	if (user.role !== 'admin') q = q.eq('reviewer_id', user.id);
	await q;
}

/** Approved or rejected: nobody needs the claim any more. */
export async function clearClaim(kind: Kind, key: string): Promise<void> {
	await db().from('review_claims').delete().eq('item_kind', kind).eq('item_key', key);
}

/** Sent back for changes: keep it for whoever decided, until it's resubmitted. */
export async function holdForChanges(reviewer: UserRow, kind: Kind, key: string): Promise<void> {
	const { error } = await db()
		.from('review_claims')
		.upsert({ item_kind: kind, item_key: key, reviewer_id: reviewer.id, claimed_at: new Date().toISOString(), expires_at: null, held: true });
	if (error) console.error('holdForChanges', error.message);
}

/** Resubmitted: back to the reviewer who asked for changes, for a day. */
export async function resumeHeld(kind: Kind, key: string): Promise<void> {
	await db()
		.from('review_claims')
		.update({ held: false, expires_at: inHours(RESUBMIT_HOURS) })
		.eq('item_kind', kind)
		.eq('item_key', key)
		.eq('held', true);
}

/**
 * Whether this reviewer may edit or decide the submission: an admin always,
 * anyone else only with a live claim on it, which this refreshes. Null when
 * they may, else what to tell them.
 */
export async function claimProblem(reviewer: UserRow, kind: Kind, key: string): Promise<string | null> {
	if (reviewer.role === 'admin') return null;
	const { data: c } = await db()
		.from('review_claims')
		.select('expires_at')
		.eq('item_kind', kind)
		.eq('item_key', key)
		.eq('reviewer_id', reviewer.id)
		.or(LIVE())
		.maybeSingle();
	if (!c) return 'Claim this submission before reviewing it. Your claim may have lapsed or been released.';
	// working on it keeps it theirs; never shortens a longer resubmission window
	const next = inHours(CLAIM_HOURS);
	if (c.expires_at && c.expires_at < next) {
		await db().from('review_claims').update({ expires_at: next }).eq('item_kind', kind).eq('item_key', key).eq('reviewer_id', reviewer.id);
	}
	return null;
}
