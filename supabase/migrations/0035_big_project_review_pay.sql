-- Reviews no longer all pay the same: approving more than 10 hours on a
-- submission pays $2.50 instead of $1.50, so bigger projects get picked up.
-- Each payout records what it was worth; everything before this was $1.50.
alter table review_payouts add column if not exists usd numeric(6, 2) not null default 1.50;
