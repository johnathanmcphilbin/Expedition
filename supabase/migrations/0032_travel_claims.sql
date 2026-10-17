-- Travel grant claims, one per ask: a participant who qualifies claims what
-- they've banked for visa, flights or accommodation, and can add on more
-- later as a new claim. Claimed hours can't be moved back out; the rest of
-- their travel fund stays theirs to move. Replaces the one-per-person
-- travel_grant_requests (kept, unused).
create table if not exists travel_claims (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users (id) on delete cascade,
  bucket        text not null check (bucket in ('visa', 'flights', 'accommodation')),
  hours         numeric(6, 2) not null check (hours > 0),
  usd           numeric(8, 2) not null,
  status        text not null default 'requested'
                  check (status in ('requested', 'approved', 'declined', 'withdrawn', 'paid')),
  note          text,
  admin_note    text,
  requested_at  timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid references users (id),
  paid_at       timestamptz,
  paid_by       uuid references users (id)
);
create index if not exists travel_claims_user_idx on travel_claims (user_id);
alter table travel_claims enable row level security;
revoke all on travel_claims from anon, authenticated;

-- travel already marked paid (per person, before claims) becomes paid claims,
-- so those hours stay held and the money shows as paid
insert into travel_claims (user_id, bucket, hours, usd, status, note, requested_at, decided_at, decided_by, paid_at, paid_by)
select p.user_id, p.bucket, round(p.amount_usd / 8, 2), p.amount_usd, 'paid', p.note, p.paid_at, p.paid_at, p.paid_by, p.paid_at, p.paid_by
from travel_payouts p
where p.amount_usd > 0
  and not exists (select 1 from travel_claims c where c.user_id = p.user_id and c.bucket = p.bucket and c.paid_at = p.paid_at);
