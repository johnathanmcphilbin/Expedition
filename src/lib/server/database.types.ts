/**
 * Hand-written types mirroring supabase/migrations/.
 * Keep in sync when you add a migration.
 */

export type UserRole = 'participant' | 'reviewer' | 'admin';

export type SubmissionStatus =
	| 'pending'
	| 'in_review'
	| 'approved'
	| 'changes_requested'
	| 'rejected';

export type ReviewDecision = 'approved' | 'changes_requested' | 'rejected';

export type HourTransactionType =
	| 'checkpoint_approved'
	| 'reward_claimed'
	| 'travel_allocation'
	| 'manual_adjustment';

export type UserRow = {
	id: string;
	hackclub_id: string;
	slack_id: string | null;
	email: string | null;
	display_name: string | null;
	avatar_url: string | null;
	role: UserRole;
	created_at: string;
	updated_at: string;
}

export type ProjectRow = {
	id: string;
	user_id: string;
	title: string;
	description: string | null;
	repo_url: string | null;
	demo_url: string | null;
	hackatime_project: string | null;
	created_at: string;
	updated_at: string;
}

export type SubmissionRow = {
	id: string;
	project_id: string;
	user_id: string;
	hours_requested: number;
	description: string;
	status: SubmissionStatus;
	submitted_at: string;
	updated_at: string;
}

export type AttachmentRow = {
	id: string;
	submission_id: string;
	storage_key: string;
	content_type: string;
	filename: string;
	size_bytes: number;
	created_at: string;
}

export type ReviewRow = {
	id: string;
	submission_id: string;
	reviewer_id: string;
	decision: ReviewDecision;
	hours_approved: number | null;
	feedback: string | null;
	created_at: string;
}

export type HourTransactionRow = {
	id: string;
	user_id: string;
	amount: number;
	type: HourTransactionType;
	reference_id: string | null;
	note: string | null;
	created_at: string;
}

export type HackatimeConnectionRow = {
	user_id: string;
	hackatime_user_id: string | null;
	access_token: string;
	refresh_token: string | null;
	expires_at: string | null;
	scope: string | null;
	connected_at: string;
	updated_at: string;
}

export type SessionRow = {
	token_hash: string;
	user_id: string;
	expires_at: string;
	created_at: string;
	user_agent: string | null;
	ip: string | null;
}

export type HourBalanceRow = {
	user_id: string;
	hours_earned: number;
	hours_spent: number;
	hours_available: number;
}

type Table<Row> = {
	Row: Row;
	Insert: Partial<Row>;
	Update: Partial<Row>;
	Relationships: [];
};

/** Per-project hours, derived from the ledger. See migration 0003. */
export type ProjectHoursRow = {
	project_id: string;
	user_id: string;
	title: string;
	hackatime_project: string | null;
	hours_earned: number;
	checkpoints_approved: number;
	last_checkpoint_at: string | null;
}

/** Totals across every project — how far around the expedition they are. */
export type ExpeditionProgressRow = {
	user_id: string;
	hours_earned: number;
	hours_target: number;
	checkpoints_reached: number;
	checkpoints_total: number;
	percent_complete: number;
	hours_remaining: number;
	finished: boolean;
}

export interface Database {
	public: {
		Tables: {
			users: Table<UserRow>;
			sessions: Table<SessionRow>;
			projects: Table<ProjectRow>;
			submissions: Table<SubmissionRow>;
			attachments: Table<AttachmentRow>;
			reviews: Table<ReviewRow>;
			hour_transactions: Table<HourTransactionRow>;
			hackatime_connections: Table<HackatimeConnectionRow>;
		};
		Views: {
			user_hour_balances: { Row: HourBalanceRow; Relationships: [] };
			project_hours: { Row: ProjectHoursRow; Relationships: [] };
			user_expedition_progress: { Row: ExpeditionProgressRow; Relationships: [] };
		};
		Functions: {
			review_submission: {
				Args: {
					p_submission_id: string;
					p_reviewer_id: string;
					p_decision: ReviewDecision;
					p_hours_approved?: number | null;
					p_feedback?: string | null;
				};
				Returns: string;
			};
		};
		Enums: {
			user_role: UserRole;
			submission_status: SubmissionStatus;
			review_decision: ReviewDecision;
			hour_transaction_type: HourTransactionType;
		};
	};
}
