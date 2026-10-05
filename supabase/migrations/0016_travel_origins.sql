-- Each participant's nearest airport, worked out from the city on their
-- submission, for estimating what it costs to fly them to Dublin. Only the
-- airport is kept; the address itself stays in Hack Club's Airtable.
create table if not exists travel_origins (
  user_id            uuid primary key references users (id) on delete cascade,
  airport            text not null,           -- IATA code, e.g. DEL
  airport_name       text not null,
  airport_city       text,
  country_code       text,                    -- ISO 3166-1 alpha-2 of where they live
  to_airport_km      integer,                 -- from their city to that airport
  flight_km          integer not null,        -- that airport to Dublin, great circle
  hub                boolean not null default true, -- a major international gateway
  precision          text not null check (precision in ('city', 'region', 'country')),
  updated_at         timestamptz not null default now()
);

alter table travel_origins enable row level security;
revoke all on travel_origins from anon, authenticated;

-- added after the first version of this file went out; safe to re-run
alter table travel_origins add column if not exists hub boolean not null default true;
