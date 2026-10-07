-- Non-admin reviewers earn hours for reviewing: one payout per submission
-- they decide (never twice for the same one, however often it's changed).
-- The hours themselves are a manual_adjustment in hour_transactions, so they
-- count as spendable hours but not as approved build hours.
create table if not exists review_payouts (
  item_kind    text not null check (item_kind in ('hc', 'new')),
  item_key     text not null,
  reviewer_id  uuid not null references users (id) on delete cascade,
  amount       numeric(6, 2),
  paid_at      timestamptz not null default now(),
  primary key (item_kind, item_key)
);

create index if not exists review_payouts_reviewer_idx on review_payouts (reviewer_id);

alter table review_payouts enable row level security;
revoke all on review_payouts from anon, authenticated;
