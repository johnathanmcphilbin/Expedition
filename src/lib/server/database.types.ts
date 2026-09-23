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

/**
 * A cached row from Hack Club's own "YSWS Project Submission" Airtable table.
 * Hack Club is the source of truth for whether a project was submitted —
 * this is only a local copy, refreshed on demand. `user_id` is null when the
 * submitter's Hackatime ID didn't match a known Expedition account.
 */
export type HackClubSubmissionRow = {
	airtable_record_id: string;
	user_id: string | null;
	hackatime_user_id: string | null;
	first_name: string | null;
	last_name: string | null;
	email: string | null;
	github_username: string | null;
	code_url: string | null;
	playable_url: string | null;
	description: string | null;
	project_names_raw: string | null;
	airtable_status: string | null;
	airtable_created_at: string | null;
	synced_at: string;
}

/**
 * Expedition's own review of one Hack Club submission, scoped to one
 * Hackatime project. This — not HackClubSubmissionRow — is what makes hours
 * spendable.
 */
export type SubmissionReviewRow = {
	id: string;
	airtable_record_id: string;
	user_id: string;
	hackatime_project: string;
	submitted_hours: number | null;
	approved_hours: number | null;
	status: SubmissionStatus;
	internal_notes: string | null;
	participant_feedback: string | null;
	reviewer_id: string | null;
	reviewed_at: string | null;
	created_at: string;
	updated_at: string;
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

export type MailingSignupRow = {
	email: string;
	created_at: string;
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
			hackclub_submissions: Table<HackClubSubmissionRow>;
			submission_reviews: Table<SubmissionReviewRow>;
			mailing_signups: Table<MailingSignupRow>;
			hour_transactions: Table<HourTransactionRow>;
			hackatime_connections: Table<HackatimeConnectionRow>;
		};
		Views: {
			user_hour_balances: { Row: HourBalanceRow; Relationships: [] };
			user_expedition_progress: { Row: ExpeditionProgressRow; Relationships: [] };
		};
		Functions: {
			review_hackclub_submission: {
				Args: {
					p_review_id: string;
					p_reviewer_id: string;
					p_status: SubmissionStatus;
					p_approved_hours?: number | null;
					p_internal_notes?: string | null;
					p_participant_feedback?: string | null;
					p_submitted_hours?: number | null;
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
