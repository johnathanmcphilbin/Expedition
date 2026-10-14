import { db } from './supabase';

/**
 * Travel grant requests. Someone who qualifies and has banked hours asks for
 * their grant, which locks their travel fund on the spot so the amount can't
 * move. An organiser approves (stays locked) or declines with a note
 * (unlocked again); withdrawing unlocks it too.
 */

export type GrantStatus = 'requested' | 'approved' | 'declined' | 'withdrawn';
export type GrantRequest = {
	user_id: string;
	status: GrantStatus;
	hours_banked: number;
	approved_hours: number;
	hours_needed: number;
	est_travel_usd: number | null;
	home_airport: string | null;
	note: string | null;
	admin_note: string | null;
	requested_at: string;
	decided_at: string | null;
};

export async function getOwnGrantRequest(userId: string): Promise<GrantRequest | null> {
	const { data } = await db().from('travel_grant_requests').select('*').eq('user_id', userId).maybeSingle();
	return (data as GrantRequest | null) ?? null;
}

/** Ask (or ask again after a decline/withdrawal). False if one is already open or approved. */
export async function requestGrant(
	userId: string,
	r: { hoursBanked: number; approvedHours: number; hoursNeeded: number; estTravelUsd: number | null; homeAirport: string | null; note: string | null }
): Promise<boolean> {
	const existing = await getOwnGrantRequest(userId);
	if (existing && (existing.status === 'requested' || existing.status === 'approved')) return false;
	const row = {
		user_id: userId,
		status: 'requested' as const,
		hours_banked: r.hoursBanked,
		approved_hours: r.approvedHours,
		hours_needed: r.hoursNeeded,
		est_travel_usd: r.estTravelUsd,
		home_airport: r.homeAirport,
		note: r.note,
		admin_note: null,
		requested_at: new Date().toISOString(),
		decided_at: null,
		decided_by: null
	};
	const { error } = existing
		? await db().from('travel_grant_requests').update(row).eq('user_id', userId).in('status', ['declined', 'withdrawn'])
		: await db().from('travel_grant_requests').insert(row);
	if (error) throw new Error(`Couldn't save the request: ${error.message}`);
	// lock the fund now: the request is for exactly what's banked
	await db().from('users').update({ travel_locked_at: new Date().toISOString() }).eq('id', userId).is('travel_locked_at', null);
	return true;
}

export async function withdrawGrant(userId: string): Promise<void> {
	const { data } = await db()
		.from('travel_grant_requests')
		.update({ status: 'withdrawn' })
		.eq('user_id', userId)
		.eq('status', 'requested')
		.select('user_id');
	if (data?.length) await db().from('users').update({ travel_locked_at: null }).eq('id', userId);
}

export type GrantWithOwner = GrantRequest & { owner: { display_name: string | null; email: string | null } | null };

export async function listGrantRequests(): Promise<GrantWithOwner[]> {
	const { data, error } = await db()
		.from('travel_grant_requests')
		.select('*, users!travel_grant_requests_user_id_fkey(display_name, email)')
		.order('requested_at', { ascending: true });
	if (error) {
		console.error('listGrantRequests', error.message);
		return [];
	}
	return ((data ?? []) as unknown as (GrantRequest & { users: GrantWithOwner['owner'] })[]).map(({ users, ...g }) => ({ ...g, owner: users }));
}

/** Approve (and lock their travel fund) or decline with a note for them. */
export async function decideGrant(adminId: string, userId: string, approve: boolean, adminNote: string | null): Promise<boolean> {
	const now = new Date().toISOString();
	const { data, error } = await db()
		.from('travel_grant_requests')
		.update({ status: approve ? 'approved' : 'declined', admin_note: adminNote, decided_at: now, decided_by: adminId })
		.eq('user_id', userId)
		.eq('status', 'requested')
		.select('user_id');
	if (error) throw new Error(error.message);
	if (!data?.length) return false;
	// approved: stays locked (it was locked when they asked). Declined: free to adjust and ask again.
	if (approve) await db().from('users').update({ travel_locked_at: now }).eq('id', userId).is('travel_locked_at', null);
	else await db().from('users').update({ travel_locked_at: null }).eq('id', userId);
	return true;
}
