-- How long each builder coded each day, from their own Hackatime. Fetched
-- for the admin "daily active builders" chart; a past day never changes, so
-- it's only asked for once. A row with 0 seconds means "checked, no coding".
create table if not exists daily_coding (
  user_id     uuid not null references users (id) on delete cascade,
  day         date not null,
  seconds     integer not null default 0,
  fetched_at  timestamptz not null default now(),
  primary key (user_id, day)
);

create index if not exists daily_coding_day_idx on daily_coding (day);

alter table daily_coding enable row level security;
revoke all on daily_coding from anon, authenticated;
