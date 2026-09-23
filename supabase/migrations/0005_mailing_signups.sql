-- Homepage email capture. Deliberately separate from `users` — this is
-- collected before anyone signs in (the hero form's real job is sending
-- people into Hack Club Auth; the email is a bonus mailing-list capture on
-- the way, not an account of any kind).

create table mailing_signups (
  email       text primary key,
  created_at  timestamptz not null default now()
);

alter table mailing_signups enable row level security;
