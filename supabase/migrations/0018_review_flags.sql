-- Reviewers can mark a submission as possible fraud so it stands out in the
-- review queue. Works for both kinds of item: a submission still in
-- Expedition's queue ('new', keyed by submission_queue.id) and one already
-- in Hack Club's Airtable ('hc', keyed by its Airtable record id).
create table if not exists review_flags (
  item_kind   text not null check (item_kind in ('hc', 'new')),
  item_key    text not null,
  reason      text,
  flagged_by  uuid references users (id),
  flagged_at  timestamptz not null default now(),
  primary key (item_kind, item_key)
);

alter table review_flags enable row level security;
revoke all on review_flags from anon, authenticated;
