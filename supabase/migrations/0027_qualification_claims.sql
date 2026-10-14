-- "I've done enough hours to cover half my trip": a participant whose real
-- trip cost is lower than our estimate claims qualification with that cost
-- (and a link to the flight). An organiser checks it; once approved, their
-- target is worked out from the claimed cost instead of the estimate.
create table if not exists qualification_claims (
  user_id          uuid primary key references users (id) on delete cascade,
  status           text not null default 'requested' check (status in ('requested', 'approved', 'declined')),
  trip_cost_usd    integer not null check (trip_cost_usd > 0),
  flight_link      text check (flight_link is null or flight_link ~* '^https?://'),
  approved_hours   numeric(6, 2) not null,  -- what they had when they claimed
  note             text,
  admin_note       text,
  requested_at     timestamptz not null default now(),
  decided_at       timestamptz,
  decided_by       uuid references users (id)
);
alter table qualification_claims enable row level security;
revoke all on qualification_claims from anon, authenticated;
