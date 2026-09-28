-- Checkpoints: every 5 tracked Hackatime hours on a project, a participant
-- posts a quick update (a screenshot and/or a video link, and a sentence or
-- two). They're evidence for the review, not a second way of earning hours:
-- hours are still approved per submission.
--
-- A participant can choose to share a checkpoint. Shared checkpoints only
-- appear on the public log once an organiser has OK'd them.

create type checkpoint_visibility as enum ('private', 'waiting', 'shown', 'hidden');

create table checkpoints (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users (id) on delete cascade,
  hackatime_project text not null,
  -- 1st checkpoint = 5 tracked hours, 2nd = 10, ...
  number            int not null,
  tracked_hours     numeric(7, 2) not null,
  worked_on         text not null,
  next_up           text,
  image_path        text,
  video_url         text,
  visibility        checkpoint_visibility not null default 'private',
  moderated_by      uuid references users (id) on delete set null,
  moderated_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint checkpoints_has_evidence check (image_path is not null or video_url is not null),
  constraint checkpoints_number_positive check (number > 0),
  constraint checkpoints_worked_on_length check (char_length(worked_on) between 1 and 2000)
);

-- one checkpoint per number per project: a double-click can't post two
create unique index checkpoints_one_per_number on checkpoints (user_id, hackatime_project, number);
create index checkpoints_visibility_idx on checkpoints (visibility, created_at desc);

create trigger checkpoints_touch before update on checkpoints
  for each row execute function touch_updated_at();

alter table checkpoints enable row level security;

-- Private bucket: the server hands out short-lived links, even for the
-- public log, so nothing is reachable by guessing a path.
insert into storage.buckets (id, name, public)
values ('checkpoint-images', 'checkpoint-images', false)
on conflict (id) do nothing;
