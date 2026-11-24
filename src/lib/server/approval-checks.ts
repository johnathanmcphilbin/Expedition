import { db } from './db';
import type { ApprovalCheckRow, UserRow } from './database.types';

/**
 * Approvals by a reviewer whose work an admin checks first (users.
 * review_needs_check). Nothing goes to Airtable and no hours are credited
 * until an admin says yes. See supabase/migrations/0049_reviewer_checks.sql.
 */

export type Kind = ApprovalCheckRow['item_kind'];
export type ApprovalCheck = ApprovalCheckRow;

/** Whether this reviewer's approvals wait for an admin. Admins' never do. */
export const needsCheck = (user: UserRow) => user.role !== 'admin' && !!user.review_needs_check;

const asCheck = (c: ApprovalCheck): ApprovalCheck => ({
	...c,
	approved_hours: Number(c.approved_hours),
	tracked_hours: c.tracked_hours === null ? null : Number(c.tracked_hours)
});

export async function listApprovalChecks(): Promise<ApprovalCheck[]> {
	const { data, error } = await db().from('approval_checks').select('*');
	// before the migration: nothing is waiting, and the queue still loads
	if (error) {
		console.error('listApprovalChecks', error.message);
		return [];
	}
	return ((data ?? []) as ApprovalCheck[]).map(asCheck);
}

export async function getApprovalCheck(kind: Kind, key: string): Promise<ApprovalCheck | null> {
	const { data, error } = await db().from('approval_checks').select('*').eq('item_kind', kind).eq('item_key', key).maybeSingle();
	if (error) throw new Error(error.message);
	return data ? asCheck(data as ApprovalCheck) : null;
}

/** Hold an approval for an admin. Approving it again replaces the last one. */
export async function holdForCheck(check: Omit<ApprovalCheck, 'held_at'>): Promise<void> {
	const { error } = await db()
		.from('approval_checks')
		.upsert({ ...check, held_at: new Date().toISOString() }, { onConflict: 'item_kind,item_key' });
	if (error) throw new Error(`Couldn't hold it for an admin's check: ${error.message}`);
}

/**
 * Take a held approval off the list to act on it. Only one request gets it,
 * so pressing yes twice can't send it twice.
 */
export async function takeApprovalCheck(kind: Kind, key: string): Promise<ApprovalCheck | null> {
	const { data, error } = await db().from('approval_checks').delete().eq('item_kind', kind).eq('item_key', key).select('*');
	if (error) throw new Error(error.message);
	const c = (data as ApprovalCheck[] | null)?.[0];
	return c ? asCheck(c) : null;
}

/** Put one back after sending it failed, so it can be tried again. */
export async function restoreApprovalCheck(check: ApprovalCheck): Promise<void> {
	const { error } = await db().from('approval_checks').upsert(check, { onConflict: 'item_kind,item_key' });
	if (error) console.error('restoreApprovalCheck', error.message);
}

/**
 * A held approval is read-only for reviewers. An admin checking it can still
 * save field edits. A decision (approve, reject, needs changes) stays on the
 * check buttons, which send it as the original reviewer.
 * Returns the error to show, or null when the save may proceed.
 */
export function rejectHeldEdit(role: string, held: boolean, savingFieldsOnly: boolean): string | null {
	if (!held) return null;
	if (role === 'admin' && savingFieldsOnly) return null;
	return "This one's waiting on an admin's check.";
}

/** Hours and feedback an admin's edit must keep valid, because clearing the check sends them. */
export function heldFieldProblem(approvedHours: number | null, feedback: string | null): string | null {
	if (approvedHours === null || approvedHours <= 0) return 'Set how many hours to approve (more than zero).';
	if (!feedback?.trim()) return 'Write the feedback they will get.';
	return null;
}

/**
 * Write an admin's edits onto the held approval. Who approved it, and when,
 * stay as they were — clearing the check still sends it as that reviewer.
 */
export async function updateHeldCheck(
	kind: Kind,
	key: string,
	edits: {
		approved_hours: number;
		tracked_hours: number | null;
		hackatime_project?: string | null;
		internal_notes: string | null;
		participant_feedback: string;
	}
): Promise<void> {
	if (!(edits.approved_hours > 0)) throw new Error('Set how many hours to approve (more than zero).');
	const feedback = edits.participant_feedback.trim();
	if (!feedback) throw new Error('Write the feedback they will get.');
	const patch: Partial<ApprovalCheck> = {
		approved_hours: edits.approved_hours,
		tracked_hours: edits.tracked_hours,
		internal_notes: edits.internal_notes,
		participant_feedback: feedback
	};
	if (edits.hackatime_project !== undefined) patch.hackatime_project = edits.hackatime_project;
	const { data, error } = await db()
		.from('approval_checks')
		.update(patch)
		.eq('item_kind', kind)
		.eq('item_key', key)
		.select('item_key');
	if (error) throw new Error(error.message);
	if (!data?.length) throw new Error('Someone has already dealt with this one.');
}
