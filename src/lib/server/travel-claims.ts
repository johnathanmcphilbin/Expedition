import { db } from './supabase';
import { TRAVEL_RATE } from '$lib/data';
import type { TravelBucket } from './database.types';

/**
 * Travel grant claims: one row per ask, per bucket. A claim takes whatever's
 * banked in that bucket and not already claimed; banking more later and
 * claiming again adds on. Requested, approved and paid claims hold their
 * hours (they can't be moved back out); declined and withdrawn ones don't.
 */

export const BUCKETS = ['visa', 'flights', 'accommodation'] as const;
const HOLDING = ['requested', 'approved', 'paid'];

export type TravelClaim = {
	id: string;
	user_id: string;
	bucket: TravelBucket;
	hours: number;
	usd: number;
	status: 'requested' | 'approved' | 'declined' | 'withdrawn' | 'paid';
	note: string | null;
	admin_note: string | null;
	requested_at: string;
	decided_at: string | null;
	paid_at: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function listOwnTravelClaims(userId: string): Promise<TravelClaim[]> {
	const { data } = await db().from('travel_claims').select('*').eq('user_id', userId).order('requested_at', { ascending: false });
	return (data ?? []) as TravelClaim[];
}

/** Per bucket: banked, already claimed (held), and what's free to claim or move back. */
export async function travelClaimable(userId: string) {
	const [{ data: b }, claims] = await Promise.all([
		db().from('user_travel_buckets').select('*').eq('user_id', userId).maybeSingle(),
		listOwnTravelClaims(userId)
	]);
	return Object.fromEntries(
		BUCKETS.map((bucket) => {
			const banked = Number(b?.[bucket] ?? 0);
			const held = claims.filter((c) => c.bucket === bucket && HOLDING.includes(c.status)).reduce((t, c) => t + Number(c.hours), 0);
			const free = r2(Math.max(0, banked - held));
			return [bucket, { banked: r2(banked), held: r2(held), free, freeUsd: r2(free * TRAVEL_RATE) }];
		})
	) as Record<TravelBucket, { banked: number; held: number; free: number; freeUsd: number }>;
}

/** Claim everything unclaimed in one bucket. Null if there's nothing to claim. */
export async function createTravelClaim(userId: string, bucket: TravelBucket, note: string | null): Promise<TravelClaim | null> {
	const free = (await travelClaimable(userId))[bucket].free;
	if (free <= 0) return null;
	const { data, error } = await db()
		.from('travel_claims')
		.insert({ user_id: userId, bucket, hours: free, usd: r2(free * TRAVEL_RATE), note })
		.select('*')
		.single();
	if (error) throw new Error(`Couldn't save the claim: ${error.message}`);
	return data as TravelClaim;
}

export async function withdrawTravelClaim(userId: string, id: string): Promise<boolean> {
	const { data } = await db()
		.from('travel_claims')
		.update({ status: 'withdrawn' })
		.eq('id', id)
		.eq('user_id', userId)
		.eq('status', 'requested')
		.select('id');
	return !!data?.length;
}

export type TravelClaimWithOwner = TravelClaim & { owner: { display_name: string | null; email: string | null; hackclub_id: string } | null };

export async function listAllTravelClaims(): Promise<TravelClaimWithOwner[]> {
	const { data, error } = await db()
		.from('travel_claims')
		.select('*, users!travel_claims_user_id_fkey(display_name, email, hackclub_id)')
		.order('requested_at', { ascending: true });
	if (error) {
		console.error('listAllTravelClaims', error.message);
		return [];
	}
	return ((data ?? []) as unknown as (TravelClaim & { users: TravelClaimWithOwner['owner'] })[])
		.filter((c) => c.users?.hackclub_id?.startsWith('ident!'))
		.map(({ users, ...c }) => ({ ...c, owner: users }));
}

export async function decideTravelClaim(adminId: string, id: string, approve: boolean, adminNote: string | null): Promise<TravelClaim | null> {
	const { data } = await db()
		.from('travel_claims')
		.update({ status: approve ? 'approved' : 'declined', admin_note: adminNote, decided_at: new Date().toISOString(), decided_by: adminId })
		.eq('id', id)
		.eq('status', 'requested')
		.select('*');
	return (data?.[0] as TravelClaim | undefined) ?? null;
}

/** Paid out (approves it too if it was still waiting). */
export async function payTravelClaim(adminId: string, id: string): Promise<TravelClaim | null> {
	const now = new Date().toISOString();
	const { data } = await db()
		.from('travel_claims')
		.update({ status: 'paid', paid_at: now, paid_by: adminId })
		.eq('id', id)
		.in('status', ['requested', 'approved'])
		.select('*');
	const claim = (data?.[0] as TravelClaim | undefined) ?? null;
	if (claim) await db().from('travel_claims').update({ decided_at: now, decided_by: adminId }).eq('id', id).is('decided_at', null);
	return claim;
}
