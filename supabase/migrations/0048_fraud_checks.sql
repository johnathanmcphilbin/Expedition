-- Approving a project holds the approval here instead of sending it straight
-- to Hack Club. It waits, with everything the approval needs, until a
-- different reviewer or admin says yes: only then is it sent to Airtable and
-- the hours credited, signed as the original approver. Saying no puts it
-- back in the queue, flagged.
--
-- Works for both kinds of item, keyed like review_flags: 'new' by
-- submission_queue.id, 'hc' by its Airtable record id.
-- Additive only: a new table. Nothing existing is altered or dropped.

create table if not exists fraud_checks (
  item_kind             text not null check (item_kind in ('hc', 'new')),
  item_key              text not null,
  -- who approved it, and so who it's sent and signed as once cleared
  approved_by           uuid not null references users (id) on delete cascade,
  approved_hours        numeric(6, 2) not null check (approved_hours > 0),
  tracked_hours         numeric(7, 2),
  -- 'hc' only: the Hackatime project the review is for
  hackatime_project     text,
  internal_notes        text,
  participant_feedback  text not null,
  held_at               timestamptz not null default now(),
  primary key (item_kind, item_key)
);

alter table fraud_checks enable row level security;
revoke all on fraud_checks from anon, authenticated;
