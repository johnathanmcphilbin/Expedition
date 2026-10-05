-- The exact flight an organiser has told each participant to take to the
-- event (5 December, Dublin), and whether they've booked it. Participants
-- book it themselves; this is what lets organisers plan airport pickups.
-- All times at Dublin airport are stored as timestamptz; departure from
-- home is kept as the local time printed on the ticket.
create table if not exists trip_flights (
  user_id            uuid primary key references users (id) on delete cascade,

  -- getting there
  out_flight         text not null,             -- e.g. "EK 511 / EK 161"
  out_from           text not null,             -- IATA, e.g. DEL
  out_departs_local  text,                      -- as on the ticket, e.g. "4 Dec 03:35"
  out_arrives_at     timestamptz not null,      -- landing in Dublin
  out_terminal       text check (out_terminal in ('T1', 'T2')),

  -- going home
  ret_flight         text,
  ret_departs_at     timestamptz,               -- leaving Dublin

  price_usd          numeric(8, 2),
  organiser_notes    text,                      -- shown to the participant

  status             text not null default 'suggested'
                       check (status in ('suggested', 'booked', 'changed', 'cancelled')),
  -- what they actually booked, if it isn't the suggested flight
  booked_flight      text,
  booked_arrives_at  timestamptz,
  booking_ref        text,                      -- admins only; never shown publicly
  booked_at          timestamptz,

  assigned_by        uuid references users (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table trip_flights enable row level security;
revoke all on trip_flights from anon, authenticated;
