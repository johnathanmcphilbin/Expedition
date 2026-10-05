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

export type TravelBucket = 'visa' | 'accommodation' | 'flights';

export type TravelBucketsRow = {
	user_id: string;
	visa: number;
	accommodation: number;
	flights: number;
}

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
	/** set once an organiser starts arranging this person's travel — freezes their fund */
	travel_locked_at: string | null;
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
	/** for where-people-are-from analytics; the rest of the address stays in Airtable */
	country: string | null;
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
	/** set when one review covers several Hackatime projects */
	hackatime_projects: string[] | null;
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

export type QueuedSubmissionStatus = 'pending' | 'changes_requested' | 'rejected' | 'sent';

/**
 * A submission waiting for an Expedition reviewer before it goes to Hack
 * Club. Personal fields (birthday, address) and the screenshot are cleared
 * once it's sent.
 */
export type QueuedSubmissionRow = {
	id: string;
	user_id: string;
	hackatime_user_id: string;
	project_name: string;
	hackatime_projects: string[];
	/** reviewer edits to Hack Club's justification fields, by Airtable field name */
	justifications: Record<string, string | null>;
	hardware: boolean;
	/** they ticked "show this in the library" */
	library_opt_in: boolean;
	code_url: string;
	playable_url: string;
	description: string;
	first_name: string;
	last_name: string;
	email: string;
	github_username: string;
	birthday: string | null;
	address_line1: string | null;
	address_line2: string | null;
	city: string | null;
	state: string | null;
	country: string | null;
	zip: string | null;
	heard_about: string | null;
	doing_well: string | null;
	improve: string | null;
	screenshot_path: string | null;
	screenshot_type: string | null;
	screenshot_name: string | null;
	status: QueuedSubmissionStatus;
	approved_hours: number | null;
	internal_notes: string | null;
	participant_feedback: string | null;
	reviewer_id: string | null;
	reviewed_at: string | null;
	airtable_record_id: string | null;
	/** set while an approve is sending it to Airtable */
	sending_at: string | null;
	sent_at: string | null;
	created_at: string;
	updated_at: string;
}

export type CheckpointVisibility = 'private' | 'waiting' | 'shown' | 'hidden';

/** A progress update posted every 5 tracked hours on a project. */
export type CheckpointRow = {
	id: string;
	user_id: string;
	hackatime_project: string;
	number: number;
	tracked_hours: number;
	worked_on: string;
	next_up: string | null;
	image_path: string | null;
	video_url: string | null;
	visibility: CheckpointVisibility;
	moderated_by: string | null;
	moderated_at: string | null;
	created_at: string;
	updated_at: string;
}

/** Someone's nearest airport, worked out from their submission's city. */
export type TravelOriginRow = {
	user_id: string;
	airport: string;
	airport_name: string;
	airport_city: string | null;
	country_code: string | null;
	to_airport_km: number | null;
	flight_km: number;
	hub: boolean;
	precision: 'city' | 'region' | 'country';
	updated_at: string;
}

export type TripFlightStatus = 'suggested' | 'booked' | 'changed' | 'cancelled';

/** The flight an organiser told someone to take to Dublin, and their booking. */
export type TripFlightRow = {
	user_id: string;
	out_flight: string;
	out_from: string;
	out_departs_local: string | null;
	out_arrives_at: string;
	out_terminal: 'T1' | 'T2' | null;
	ret_flight: string | null;
	ret_departs_at: string | null;
	price_usd: number | null;
	organiser_notes: string | null;
	status: TripFlightStatus;
	booked_flight: string | null;
	booked_arrives_at: string | null;
	booking_ref: string | null;
	booked_at: string | null;
	assigned_by: string | null;
	created_at: string;
	updated_at: string;
}

/** A reviewer's "possible fraud" mark on a submission in the review queue. */
export type ReviewFlagRow = {
	item_kind: 'hc' | 'new';
	item_key: string;
	reason: string | null;
	flagged_by: string | null;
	flagged_at: string;
}

export type HourTransactionRow = {
	id: string;
	user_id: string;
	amount: number;
	type: HourTransactionType;
	travel_bucket: TravelBucket | null;
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

export type ClaimStatus = 'requested' | 'fulfilled' | 'cancelled';

export type RewardClaimRow = {
	id: string;
	user_id: string;
	reward_key: string;
	reward_name: string;
	hours_cost: number;
	status: ClaimStatus;
	note: string | null;
	admin_notes: string | null;
	created_at: string;
	updated_at: string;
	fulfilled_at: string | null;
}

export type MailingSignupRow = {
	email: string;
	created_at: string;
}

/** A Hackatime project the participant picked as one they're working on. */
export type ExpeditionProjectRow = {
	user_id: string;
	hackatime_project: string;
	created_at: string;
}

export type HourBalanceRow = {
	user_id: string;
	hours_earned: number;
	hours_spent: number;
	/** for gear — already excludes hours banked for travel */
	hours_available: number;
	/** banked toward Dublin travel */
	hours_travel: number;
	travel_locked_at: string | null;
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
			reward_claims: Table<RewardClaimRow>;
			hour_transactions: Table<HourTransactionRow>;
			hackatime_connections: Table<HackatimeConnectionRow>;
			expedition_projects: Table<ExpeditionProjectRow>;
			submission_queue: Table<QueuedSubmissionRow>;
			checkpoints: Table<CheckpointRow>;
			travel_origins: Table<TravelOriginRow>;
			trip_flights: Table<TripFlightRow>;
			review_flags: Table<ReviewFlagRow>;
		};
		Views: {
			user_hour_balances: { Row: HourBalanceRow; Relationships: [] };
			user_expedition_progress: { Row: ExpeditionProgressRow; Relationships: [] };
			user_travel_buckets: { Row: TravelBucketsRow; Relationships: [] };
		};
		Functions: {
			reopen_review: {
				Args: { p_review_id: string; p_admin_id: string };
				Returns: void;
			};
			move_travel_hours: {
				Args: { p_user_id: string; p_hours: number; p_bucket: TravelBucket };
				Returns: void;
			};
			claim_reward: {
				Args: {
					p_user_id: string;
					p_reward_key: string;
					p_reward_name: string;
					p_hours_cost: number;
					p_note?: string | null;
				};
				Returns: string;
			};
			cancel_reward_claim: {
				Args: {
					p_claim_id: string;
					p_admin_id: string;
					p_admin_notes?: string | null;
				};
				Returns: void;
			};
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
			claim_status: ClaimStatus;
			travel_bucket: TravelBucket;
			queued_submission_status: QueuedSubmissionStatus;
			checkpoint_visibility: CheckpointVisibility;
		};
	};
}
