-- Outreach: people (besides admins) an admin lets see the list of builders
-- with unshipped projects, to message them on Slack and get them shipping.
create table if not exists outreach_access (
  email     text primary key check (email = lower(email)),
  added_by  uuid references users (id) on delete set null,
  added_at  timestamptz not null default now()
);

-- Who messaged which builder, and when. Approved hours from then on are what
-- an outreach person is paid for (see the outreach page).
create table if not exists outreach_contacts (
  user_id       uuid primary key references users (id) on delete cascade,
  contacted_by  uuid references users (id) on delete set null,
  contacted_at  timestamptz not null default now(),
  note          text check (char_length(note) <= 1000)
);

alter table outreach_access enable row level security;
alter table outreach_contacts enable row level security;
revoke all on outreach_access from anon, authenticated;
revoke all on outreach_contacts from anon, authenticated;
