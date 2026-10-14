import { db } from './supabase';

/**
 * Qualification claims: "my approved hours cover half my real trip cost".
 * Approved claims replace the estimate when working out someone's target.
 */
export type QualificationClaim = {
	user_id: string;
	status: 'requested' | 'approved' | 'declined';
	trip_cost_usd: number;
	flight_link: string | null;
	approved_hours: number;
	note: string | null;
	admin_note: string | null;
	requested_at: string;
	decided_at: string | null;
};

export async function getOwnClaim(userId: string): Promise<QualificationClaim | null> {
	const { data } = await db().from('qualification_claims').select('*').eq('user_id', userId).maybeSingle();
	return (data as QualificationClaim | null) ?? null;
}

/** New claim, or a fresh one after a decline. False if one's pending or approved. */
export async function submitClaim(
	userId: string,
	c: { tripCostUsd: number; flightLink: string | null; approvedHours: number; note: string | null }
): Promise<boolean> {
	const existing = await getOwnClaim(userId);
	if (existing && existing.status !== 'declined') return false;
	const row = {
		user_id: userId,
		status: 'requested' as const,
		trip_cost_usd: c.tripCostUsd,
		flight_link: c.flightLink,
		approved_hours: c.approvedHours,
		note: c.note,
		admin_note: null,
		requested_at: new Date().toISOString(),
		decided_at: null,
		decided_by: null
	};
	const { error } = existing
		? await db().from('qualification_claims').update(row).eq('user_id', userId).eq('status', 'declined')
		: await db().from('qualification_claims').insert(row);
	if (error) throw new Error(`Couldn't save the claim: ${error.message}`);
	return true;
}

export type ClaimWithOwner = QualificationClaim & { owner: { display_name: string | null; email: string | null } | null };

export async function listClaims(): Promise<ClaimWithOwner[]> {
	const { data, error } = await db()
		.from('qualification_claims')
		.select('*, users!qualification_claims_user_id_fkey(display_name, email)')
		.order('requested_at', { ascending: true });
	if (error) {
		console.error('listClaims', error.message);
		return [];
	}
	return ((data ?? []) as unknown as (QualificationClaim & { users: ClaimWithOwner['owner'] })[]).map(({ users, ...c }) => ({ ...c, owner: users }));
}

export async function decideClaim(adminId: string, userId: string, approve: boolean, adminNote: string | null): Promise<boolean> {
	const { data, error } = await db()
		.from('qualification_claims')
		.update({ status: approve ? 'approved' : 'declined', admin_note: adminNote, decided_at: new Date().toISOString(), decided_by: adminId })
		.eq('user_id', userId)
		.eq('status', 'requested')
		.select('user_id');
	if (error) throw new Error(error.message);
	return !!data?.length;
}
