-- Reviews no longer all pay the same: approving a project with more than 10
-- hours tracked pays $2.50 instead of $1.50, so bigger projects get picked up.
-- Each payout records what it was worth; everything before this was $1.50.
alter table review_payouts add column if not exists usd numeric(6, 2) not null default 1.50;

-- Hackatime hours on a queued submission's projects, taken when it's
-- submitted and refreshed when a reviewer opens it, so the queue can show
-- which ones pay the bigger rate without asking Hackatime for every row.
alter table submission_queue add column if not exists tracked_hours numeric(6, 2);
