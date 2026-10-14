-- The exact flight organisers picked for someone, as a link they can book
-- from (Skyscanner, Google Flights or the airline). Shown on their dashboard.
alter table trip_flights add column if not exists booking_url text
  check (booking_url is null or booking_url ~* '^https?://');
