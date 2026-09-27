-- A second pass before anything reaches Hack Club.
--
-- Submissions used to be written straight into Hack Club's Unified YSWS
-- Airtable the moment a participant pressed Submit. Now they wait here first.
-- An Expedition reviewer can edit any field, then:
--   * approve  -> the row is created in Airtable (with the approved hours
--                 and justification), cached in hackclub_submissions, and
--                 the hours credited through the existing
--                 review_hackclub_submission() path; status becomes 'sent'
--   * changes / reject -> stays here only; the participant sees the feedback
--
-- Address and birthday are only held here until the row is sent, then
-- cleared: Airtable is the one place that keeps them.

create type queued_submission_status as enum ('pending', 'changes_requested', 'rejected', 'sent');

create table submission_queue (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references users (id) on delete cascade,
  hackatime_user_id    text not null,
  project_name         text not null,
  hardware             boolean not null default false,

  code_url             text not null,
  playable_url         text not null,
  description          text not null,

  first_name           text not null,
  last_name            text not null,
  email                text not null,
  github_username      text not null,

  -- personal: nulled once sent
  birthday             date,
  address_line1        text,
  address_line2        text,
  city                 text,
  state                text,
  country              text,
  zip                  text,

  heard_about          text,
  doing_well           text,
  improve              text,

  -- in the private submission-screenshots bucket; removed once sent
  screenshot_path      text,
  screenshot_type      text,
  screenshot_name      text,

  status               queued_submission_status not null default 'pending',
  approved_hours       numeric(6, 2),
  internal_notes       text,
  participant_feedback text,
  reviewer_id          uuid references users (id) on delete set null,
  reviewed_at          timestamptz,
  -- set the moment Airtable accepts the row, so a retry after a later
  -- failure never creates a duplicate
  airtable_record_id   text,
  sent_at              timestamptz,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint submission_queue_hours_positive check (approved_hours is null or approved_hours > 0)
);

create index submission_queue_user_idx on submission_queue (user_id);
create index submission_queue_status_idx on submission_queue (status);

create trigger submission_queue_touch before update on submission_queue
  for each row execute function touch_updated_at();

alter table submission_queue enable row level security;

-- Private bucket: only the server (service role) reads or writes it.
insert into storage.buckets (id, name, public)
values ('submission-screenshots', 'submission-screenshots', false)
on conflict (id) do nothing;
