-- A reviewer claims a waiting submission before reviewing it, so two people
-- never work on the same one. One claim per submission (the primary key is
-- what stops two claiming at once). A claim lapses at expires_at (a couple
-- of hours after the last edit); the app treats lapsed ones as free.
-- Sending one back for changes holds the claim (held, no expiry) so the
-- resubmission comes back to the same reviewer.
create table if not exists review_claims (
  item_kind    text not null check (item_kind in ('hc', 'new')),
  item_key     text not null,
  reviewer_id  uuid not null references users (id) on delete cascade,
  claimed_at   timestamptz not null default now(),
  expires_at   timestamptz,
  held         boolean not null default false,
  primary key (item_kind, item_key)
);

create index if not exists review_claims_reviewer_idx on review_claims (reviewer_id);

alter table review_claims enable row level security;
revoke all on review_claims from anon, authenticated;

-- in case the table was made before holding existed
alter table review_claims add column if not exists expires_at timestamptz;
alter table review_claims add column if not exists held boolean not null default false;
