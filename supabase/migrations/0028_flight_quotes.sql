-- Cheapest return fare found on Google Flights for each home airport to
-- Ireland (Dublin or Shannon) for the event dates. Cached so Google is asked
-- at most every few hours per airport, not on every dashboard load.
-- price_usd null = nothing found (or the lookup failed) last time.
create table if not exists flight_quotes (
  airport      text primary key,
  destination  text,
  price_usd    integer,
  airlines     text,
  stops        integer,
  depart_local text,          -- first leg, local time at the departure airport
  arrive_local text,          -- landing in Ireland, Irish time
  link         text,          -- Google Flights for exactly this search
  fetched_at   timestamptz not null default now()
);
alter table flight_quotes enable row level security;
revoke all on flight_quotes from anon, authenticated;
