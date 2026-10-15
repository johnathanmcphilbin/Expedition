-- Travel stipend money an organiser has actually paid someone, per bucket.
-- Append-only like the ledger: a mistake is fixed with a negative row.
create table if not exists travel_payouts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users (id) on delete cascade,
  bucket      text not null check (bucket in ('visa', 'flights', 'accommodation')),
  amount_usd  numeric(8, 2) not null check (amount_usd <> 0),
  note        text,
  paid_by     uuid references users (id),
  paid_at     timestamptz not null default now()
);
create index if not exists travel_payouts_user_idx on travel_payouts (user_id);
alter table travel_payouts enable row level security;
revoke all on travel_payouts from anon, authenticated;
