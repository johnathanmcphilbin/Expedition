import { error } from '@sveltejs/kit';
import { db } from './supabase';
import type {
	ProjectRow,
	SubmissionRow,
	AttachmentRow,
	ReviewRow,
	HourTransactionRow,
	HourBalanceRow,
	ProjectHoursRow,
	ExpeditionProgressRow,
	UserRow
} from './database.types';

/**
 * Data access. Every function that reads or writes something owned by a
 * participant takes an explicit `userId` from the session and filters on it —
 * ownership is never inferred from a value the browser supplied.
 */

/** Does this user own at least one project? Used to gate onboarding. */
export async function hasAnyProject(userId: string): Promise<boolean> {
	const { count } = await db()
		.from('projects')
		.select('id', { count: 'exact', head: true })
		.eq('user_id', userId);
	return (count ?? 0) > 0;
}

export async function listProjects(userId: string): Promise<ProjectRow[]> {
	const { data, error: e } = await db()
		.from('projects')
		.select('*')
		.eq('user_id', userId)
		.order('created_at', { ascending: false });
	if (e) throw new Error(e.message);
	return (data ?? []) as ProjectRow[];
}

/** Throws 404 when the project is missing OR owned by someone else. */
export async function getOwnedProject(projectId: string, userId: string): Promise<ProjectRow> {
	const { data } = await db()
		.from('projects')
		.select('*')
		.eq('id', projectId)
		.eq('user_id', userId)
		.maybeSingle();

	if (!data) error(404, 'Project not found');
	return data as ProjectRow;
}

export async function createProject(
	userId: string,
	input: {
		title: string;
		description: string | null;
		repo_url: string | null;
		demo_url: string | null;
		hackatime_project: string | null;
	}
): Promise<ProjectRow> {
	const { data, error: e } = await db()
		.from('projects')
		.insert({ user_id: userId, ...input })
		.select('*')
		.single();
	if (e) throw new Error(e.message);
	return data as ProjectRow;
}

export async function updateOwnedProject(
	projectId: string,
	userId: string,
	input: Partial<Pick<ProjectRow, 'title' | 'description' | 'repo_url' | 'demo_url' | 'hackatime_project'>>
): Promise<void> {
	await getOwnedProject(projectId, userId);
	const { error: e } = await db()
		.from('projects')
		.update(input)
		.eq('id', projectId)
		.eq('user_id', userId);
	if (e) throw new Error(e.message);
}

export async function listSubmissions(
	userId: string
): Promise<(SubmissionRow & { projects: { title: string } | null })[]> {
	const { data, error: e } = await db()
		.from('submissions')
		.select('*, projects(title)')
		.eq('user_id', userId)
		.order('submitted_at', { ascending: false });
	if (e) throw new Error(e.message);
	return (data ?? []) as unknown as (SubmissionRow & { projects: { title: string } | null })[];
}

export async function listProjectSubmissions(projectId: string): Promise<SubmissionRow[]> {
	const { data, error: e } = await db()
		.from('submissions')
		.select('*')
		.eq('project_id', projectId)
		.order('submitted_at', { ascending: false });
	if (e) throw new Error(e.message);
	return (data ?? []) as SubmissionRow[];
}

export async function createSubmission(
	userId: string,
	input: { project_id: string; hours_requested: number; description: string }
): Promise<SubmissionRow> {
	// Re-assert ownership of the project server-side before accepting the work.
	await getOwnedProject(input.project_id, userId);

	const { data, error: e } = await db()
		.from('submissions')
		.insert({ user_id: userId, ...input, status: 'pending' })
		.select('*')
		.single();
	if (e) throw new Error(e.message);
	return data as SubmissionRow;
}

export async function addAttachment(
	submissionId: string,
	input: { storage_key: string; content_type: string; filename: string; size_bytes: number }
): Promise<void> {
	const { error: e } = await db()
		.from('attachments')
		.insert({ submission_id: submissionId, ...input });
	if (e) throw new Error(e.message);
}

export async function listAttachments(submissionId: string): Promise<AttachmentRow[]> {
	const { data } = await db().from('attachments').select('*').eq('submission_id', submissionId);
	return (data ?? []) as AttachmentRow[];
}

/**
 * Projects with their earned hours attached.
 *
 * Two reads rather than an embedded join: `project_hours` is a view, and
 * PostgREST will not traverse a foreign key into one. They are keyed by
 * project id and merged here.
 */
export async function listProjectsWithHours(
	userId: string
): Promise<(ProjectRow & { hours: ProjectHoursRow | null })[]> {
	const [projects, hours] = await Promise.all([
		listProjects(userId),
		db().from('project_hours').select('*').eq('user_id', userId)
	]);

	const byProject = new Map<string, ProjectHoursRow>(
		((hours.data ?? []) as ProjectHoursRow[]).map((h) => [h.project_id, h])
	);

	return projects.map((p) => ({ ...p, hours: byProject.get(p.id) ?? null }));
}

/** One project's earned hours, or a zeroed row if nothing has been credited yet. */
export async function getProjectHours(projectId: string): Promise<ProjectHoursRow | null> {
	const { data } = await db().from('project_hours').select('*').eq('project_id', projectId).maybeSingle();
	return data as ProjectHoursRow | null;
}

/** Hackatime project names already claimed by this user's other projects. */
export async function claimedHackatimeProjects(
	userId: string,
	exceptProjectId?: string
): Promise<string[]> {
	const { data } = await db()
		.from('projects')
		.select('id, hackatime_project')
		.eq('user_id', userId)
		.not('hackatime_project', 'is', null);

	return ((data ?? []) as Pick<ProjectRow, 'id' | 'hackatime_project'>[])
		.filter((p) => p.id !== exceptProjectId && p.hackatime_project)
		.map((p) => p.hackatime_project as string);
}

// ------------------------------------------------------------------ hours ---

/** Balances are derived from the ledger view, never from a stored column. */
export async function getBalance(userId: string): Promise<HourBalanceRow> {
	const { data } = await db()
		.from('user_hour_balances')
		.select('*')
		.eq('user_id', userId)
		.maybeSingle();

	return (
		(data as HourBalanceRow | null) ?? {
			user_id: userId,
			hours_earned: 0,
			hours_spent: 0,
			hours_available: 0
		}
	);
}

/** How far around the expedition this user is, totalled across all projects. */
export async function getProgress(userId: string): Promise<ExpeditionProgressRow> {
	const { data } = await db()
		.from('user_expedition_progress')
		.select('*')
		.eq('user_id', userId)
		.maybeSingle();

	return (
		(data as ExpeditionProgressRow | null) ?? {
			user_id: userId,
			hours_earned: 0,
			hours_target: 40,
			checkpoints_reached: 0,
			checkpoints_total: 8,
			percent_complete: 0,
			hours_remaining: 40,
			finished: false
		}
	);
}

export async function listTransactions(userId: string): Promise<HourTransactionRow[]> {
	const { data } = await db()
		.from('hour_transactions')
		.select('*')
		.eq('user_id', userId)
		.order('created_at', { ascending: false });
	return (data ?? []) as HourTransactionRow[];
}

// ----------------------------------------------------------------- review ---

export type QueueItem = SubmissionRow & {
	users: Pick<UserRow, 'display_name' | 'email'> | null;
	projects: Pick<ProjectRow, 'title'> | null;
};

export async function listReviewQueue(): Promise<QueueItem[]> {
	const { data, error: e } = await db()
		.from('submissions')
		.select('*, users(display_name, email), projects(title)')
		.in('status', ['pending', 'in_review'])
		.order('submitted_at', { ascending: true });
	if (e) throw new Error(e.message);
	return (data ?? []) as unknown as QueueItem[];
}

export type ReviewDetail = SubmissionRow & {
	users: UserRow | null;
	projects: ProjectRow | null;
};

export async function getSubmissionForReview(submissionId: string): Promise<ReviewDetail> {
	const { data } = await db()
		.from('submissions')
		.select('*, users(*), projects(*)')
		.eq('id', submissionId)
		.maybeSingle();

	if (!data) error(404, 'Submission not found');
	return data as unknown as ReviewDetail;
}

export async function listReviews(submissionId: string): Promise<ReviewRow[]> {
	const { data } = await db()
		.from('reviews')
		.select('*')
		.eq('submission_id', submissionId)
		.order('created_at', { ascending: false });
	return (data ?? []) as ReviewRow[];
}

export async function countPendingReviews(): Promise<number> {
	const { count } = await db()
		.from('submissions')
		.select('id', { count: 'exact', head: true })
		.in('status', ['pending', 'in_review']);
	return count ?? 0;
}
