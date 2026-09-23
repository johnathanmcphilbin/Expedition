-- Replace Expedition's own duplicate submission system with a review layer
-- over Hack Club's real "Unified YSWS" submissions.
--
-- ARCHITECTURE
--   Hack Club Auth      -> identity (unchanged)
--   Hackatime            -> tracked time evidence (unchanged)
--   Hack Club Airtable   -> THE canonical record of what was submitted.
--                            `hackclub_submissions` below is a CACHE of it,
--                            never the source of truth. A missing cache row
--                            means "not synced yet", not "not submitted".
--   submission_reviews   -> Expedition's own opinion about a Hack Club
--                            submission: how many of the submitted hours we
--                            approve. This is the ONLY thing Expedition adds.
--
-- REMOVED: `projects`, `submissions`, `attachments`, `reviews` and
-- `review_submission()`. These were a second, Expedition-only submission
-- system participants had to fill in on top of the real Hack Club one — the
-- exact duplication this migration exists to undo. Nothing of value is lost:
-- every row in these tables at the time of writing was either empty or a
-- leftover from onboarding UI that no longer exists (no real submission or
-- review was ever recorded against them).

-- ---------------------------------------------------- drop the old system --

drop function if exists review_submission(uuid, uuid, review_decision, numeric, text);
drop view if exists project_hours;
drop table if exists attachments;
drop table if exists reviews;
drop table if exists submissions;
drop table if exists projects;

-- `user_role`, `submission_status`, `review_decision` and
-- `hour_transaction_type` are all kept and reused below — the concepts
-- (a role, a review's status, a review's decision, a ledger entry's kind)
-- did not change, only what they attach to did.

-- ------------------------------------------------- hack club submissions ---

-- A cache of relevant rows from Hack Club's "YSWS Project Submission"
-- Airtable table, refreshed on demand (see src/lib/server/airtable.ts). Never
-- treated as proof a project was submitted on its own — it can be stale or
-- simply not yet synced. Re-sync rather than trusting an empty result.
create table hackclub_submissions (
  airtable_record_id  text primary key,
  -- null when the submitter's Hackatime ID didn't match a known Expedition
  -- user (not yet connected here, or a typo on their end) — still cached and
  -- shown to admins so nothing silently disappears.
  user_id             uuid references users (id) on delete set null,
  hackatime_user_id   text,
  first_name          text,
  last_name           text,
  email               text,
  github_username     text,
  code_url            text,
  playable_url        text,
  description         text,
  -- free text from Hack Club's own form, e.g. "my-site (Jan 1 - Jan 15)" —
  -- not structured, so a reviewer picks/confirms the actual project name
  -- when opening the review, stored on submission_reviews.hackatime_project
  project_names_raw   text,
  airtable_status      text,
  airtable_created_at timestamptz,
  synced_at           timestamptz not null default now()
);

create index hackclub_submissions_user_id_idx on hackclub_submissions (user_id);
create index hackclub_submissions_hackatime_user_id_idx on hackclub_submissions (hackatime_user_id);

-- --------------------------------------------------------- review layer ----

-- Expedition's own review of one Hack Club submission, scoped to one
-- Hackatime project (a single submission can name more than one). This table
-- is what makes hours spendable — never hackclub_submissions on its own.
create table submission_reviews (
  id                    uuid primary key default gen_random_uuid(),
  airtable_record_id    text not null references hackclub_submissions (airtable_record_id) on delete cascade,
  user_id               uuid not null references users (id) on delete cascade,
  hackatime_project     text not null,
  -- snapshot of Hackatime tracked time for that project at review time —
  -- refreshable, but stored so the record of what was reviewed doesn't drift
  -- if the participant keeps coding on the same project afterwards
  submitted_hours       numeric(6, 2),
  approved_hours        numeric(6, 2),
  status                submission_status not null default 'pending',
  internal_notes        text,
  participant_feedback  text,
  reviewer_id           uuid references users (id) on delete set null,
  reviewed_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint submission_reviews_one_per_project
    unique (airtable_record_id, hackatime_project),
  constraint submission_reviews_hours_match_status check (
    (status = 'approved' and approved_hours is not null and approved_hours > 0)
    or (status <> 'approved')
  )
);

create index submission_reviews_user_id_idx on submission_reviews (user_id);
create index submission_reviews_status_idx on submission_reviews (status);
-- the review queue reads pending/changes_requested ordered by age
create index submission_reviews_queue_idx on submission_reviews (created_at)
  where status in ('pending', 'in_review', 'changes_requested');

create trigger submission_reviews_touch before update on submission_reviews
  for each row execute function touch_updated_at();

alter table hackclub_submissions enable row level security;
alter table submission_reviews   enable row level security;

-- ---------------------------------------------------- review + credit -----

-- Atomic, idempotent review decision — the direct replacement for
-- review_submission(). Same shape of guarantee: permission check, self-review
-- check, terminal-state guard, the review write and the ledger credit all
-- happen in one transaction, and the ledger's own unique index
-- (hour_transactions_one_credit_per_submission, from migration 0001) makes a
-- double-submitted approval impossible even if this function were called
-- twice concurrently.
create or replace function review_hackclub_submission(
  p_review_id             uuid,
  p_reviewer_id           uuid,
  p_status                submission_status,
  p_approved_hours        numeric default null,
  p_internal_notes        text default null,
  p_participant_feedback  text default null,
  p_submitted_hours       numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reviewer_role   user_role;
  v_owner_id        uuid;
  v_current_status  submission_status;
begin
  -- 1. admin only. Unlike the old system, "reviewer" is not accepted here —
  --    Expedition's review panel is admin-only by design (see guards.ts).
  select role into v_reviewer_role from users where id = p_reviewer_id;
  if v_reviewer_role is null then
    raise exception 'reviewer not found' using errcode = 'P0002';
  end if;
  if v_reviewer_role <> 'admin' then
    raise exception 'not authorised to review' using errcode = '42501';
  end if;

  -- 2. lock the review row so two concurrent decisions serialise here
  select user_id, status into v_owner_id, v_current_status
  from submission_reviews
  where id = p_review_id
  for update;

  if v_owner_id is null then
    raise exception 'review not found' using errcode = 'P0002';
  end if;

  -- 3. nobody reviews their own submission, not even an admin
  if v_owner_id = p_reviewer_id then
    raise exception 'cannot review your own submission' using errcode = '42501';
  end if;

  -- 4. approved/rejected are terminal — a correction goes through the
  --    admin ledger tool (manual_adjustment) instead of silently rewriting
  --    history. changes_requested is NOT terminal: the reviewer may come
  --    back once the participant has addressed it.
  if v_current_status in ('approved', 'rejected') then
    raise exception 'review already %', v_current_status using errcode = '55000';
  end if;

  -- 5. an approval must carry a sane number of hours. A non-approved status
  --    may still carry a draft number (e.g. jotted down before deciding) —
  --    only what actually pays out is constrained.
  if p_status = 'approved' then
    if p_approved_hours is null or p_approved_hours <= 0 then
      raise exception 'approved hours must be positive' using errcode = '22023';
    end if;
  end if;
  if p_approved_hours is not null and p_approved_hours > 200 then
    raise exception 'approved hours implausibly large' using errcode = '22023';
  end if;

  -- approved_hours is stored whenever given, not only on a final approval —
  -- "Save Review" while still pending can jot down a draft number without
  -- it vanishing. Only the ledger credit below is gated on p_status.
  -- reviewer_id/reviewed_at only move on an actual decision, not a draft
  -- save while still pending — they mean "who decided this and when", not
  -- "who last touched it".
  update submission_reviews set
    status = p_status,
    approved_hours = coalesce(p_approved_hours, approved_hours),
    -- refreshed from a live Hackatime call by the caller on every save, so
    -- the stored figure reflects what the reviewer actually saw
    submitted_hours = coalesce(p_submitted_hours, submitted_hours),
    internal_notes = nullif(btrim(coalesce(p_internal_notes, '')), ''),
    participant_feedback = nullif(btrim(coalesce(p_participant_feedback, '')), ''),
    reviewer_id = case when p_status <> 'pending' then p_reviewer_id else reviewer_id end,
    reviewed_at = case when p_status <> 'pending' then now() else reviewed_at end
  where id = p_review_id;

  -- 6. credit the ledger, but only on approval — reference_id points at the
  --    review row, so the existing one-credit-per-reference unique index
  --    still guarantees at most one payout no matter how this is retried.
  if p_status = 'approved' then
    insert into hour_transactions (user_id, amount, type, reference_id, note)
    values (
      v_owner_id,
      p_approved_hours,
      'checkpoint_approved',
      p_review_id,
      'Hack Club submission approved'
    );
  end if;

  return p_review_id;
end;
$$;

revoke all on function review_hackclub_submission(uuid, uuid, submission_status, numeric, text, text, numeric) from public;
revoke all on function review_hackclub_submission(uuid, uuid, submission_status, numeric, text, text, numeric) from anon;
revoke all on function review_hackclub_submission(uuid, uuid, submission_status, numeric, text, text, numeric) from authenticated;
grant execute on function review_hackclub_submission(uuid, uuid, submission_status, numeric, text, text, numeric) to service_role;
