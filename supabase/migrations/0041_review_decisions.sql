-- Every review decision, one row each, for the reviewer stats and
-- leaderboard. The submissions themselves only keep their latest decision,
-- so a "needs changes" that was later resubmitted would otherwise vanish.
-- Drafts aren't decisions and aren't logged.
create table if not exists review_decisions (
  id              uuid primary key default gen_random_uuid(),
  item_kind       text not null check (item_kind in ('hc', 'new')),
  item_key        text not null,
  reviewer_id     uuid references users (id) on delete set null,
  decision        text not null check (decision in ('approved', 'changes_requested', 'rejected')),
  approved_hours  numeric(6, 2),
  tracked_hours   numeric(7, 2),
  hardware        boolean not null default false,
  decided_at      timestamptz not null default now()
);

create unique index if not exists review_decisions_once on review_decisions (item_kind, item_key, decided_at);
create index if not exists review_decisions_reviewer_idx on review_decisions (reviewer_id);
create index if not exists review_decisions_at_idx on review_decisions (decided_at);

alter table review_decisions enable row level security;
revoke all on review_decisions from anon, authenticated;

-- what's known so far: each submission's current decision
insert into review_decisions (item_kind, item_key, reviewer_id, decision, approved_hours, tracked_hours, hardware, decided_at)
select 'hc', r.airtable_record_id, r.reviewer_id, r.status, r.approved_hours, r.submitted_hours, coalesce(q.hardware, false), r.reviewed_at
from submission_reviews r
left join submission_queue q on q.airtable_record_id = r.airtable_record_id
where r.status in ('approved', 'changes_requested', 'rejected') and r.reviewed_at is not null
on conflict do nothing;

insert into review_decisions (item_kind, item_key, reviewer_id, decision, tracked_hours, hardware, decided_at)
select 'new', q.id::text, q.reviewer_id, q.status, q.tracked_hours, q.hardware, q.reviewed_at
from submission_queue q
where q.status in ('changes_requested', 'rejected') and q.reviewed_at is not null
on conflict do nothing;
