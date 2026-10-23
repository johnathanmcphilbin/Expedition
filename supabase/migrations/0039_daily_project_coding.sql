-- Coding time per Hackatime project per day, for the admin chart of
-- Expedition projects worked on each day. Kept for every project so one
-- connected later still counts for the days before; the chart only counts
-- projects connected to Expedition. A row with project '' and 0 seconds
-- means "checked that day, nothing coded". A past day never changes.
create table if not exists daily_project_coding (
  user_id     uuid not null references users (id) on delete cascade,
  day         date not null,
  project     text not null,
  seconds     integer not null default 0,
  fetched_at  timestamptz not null default now(),
  primary key (user_id, day, project)
);

create index if not exists daily_project_coding_day_idx on daily_project_coding (day);

alter table daily_project_coding enable row level security;
revoke all on daily_project_coding from anon, authenticated;

-- replaced by this: it was all coding, on any project
drop table if exists daily_coding;
