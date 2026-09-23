-- Spending approved hours on gear.
--
-- Hours enter the ledger only from an approved review
-- (review_hackclub_submission). This migration adds the other side: a
-- participant spending them. The debit and the claim row are written in ONE
-- transaction behind an affordability check, so two clicks — or two tabs —
-- cannot overdraw a balance.

create type claim_status as enum ('requested', 'fulfilled', 'cancelled');

create table reward_claims (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users (id) on delete cascade,
  -- the catalogue lives in src/lib/data.ts, keyed by its hour tier. Name and
  -- cost are snapshotted here so editing the catalogue later never rewrites
  -- what somebody actually claimed.
  reward_key    text not null,
  reward_name   text not null,
  hours_cost    numeric(6, 2) not null,
  status        claim_status not null default 'requested',
  note          text,
  admin_notes   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  fulfilled_at  timestamptz,
  constraint reward_claims_cost_positive check (hours_cost > 0)
);

create index reward_claims_user_id_idx on reward_claims (user_id);
create index reward_claims_status_idx on reward_claims (status);

create trigger reward_claims_touch before update on reward_claims
  for each row execute function touch_updated_at();

alter table reward_claims enable row level security;

-- ----------------------------------------------------------- claim + debit --

-- Atomic: lock the user, compute their balance from the ledger inside the
-- transaction, refuse if they cannot afford it, then write the claim and the
-- debit together. Locking the user row (rather than a balance row, which is
-- a view over an append-only table and cannot be locked) is what serialises
-- concurrent claims by the same person.
create or replace function claim_reward(
  p_user_id      uuid,
  p_reward_key   text,
  p_reward_name  text,
  p_hours_cost   numeric,
  p_note         text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists   uuid;
  v_balance  numeric;
  v_claim_id uuid;
begin
  if p_hours_cost is null or p_hours_cost <= 0 then
    raise exception 'reward cost must be positive' using errcode = '22023';
  end if;

  -- serialise this user's claims against each other
  select id into v_exists from users where id = p_user_id for update;
  if v_exists is null then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  select coalesce(sum(amount), 0) into v_balance
  from hour_transactions
  where user_id = p_user_id;

  if v_balance < p_hours_cost then
    raise exception 'not enough hours: % available, % needed', v_balance, p_hours_cost
      using errcode = '22023';
  end if;

  insert into reward_claims (user_id, reward_key, reward_name, hours_cost, note)
  values (
    p_user_id,
    p_reward_key,
    p_reward_name,
    p_hours_cost,
    nullif(btrim(coalesce(p_note, '')), '')
  )
  returning id into v_claim_id;

  -- negative, matching hour_transactions_sign_matches_type for reward_claimed
  insert into hour_transactions (user_id, amount, type, reference_id, note)
  values (p_user_id, -p_hours_cost, 'reward_claimed', v_claim_id, p_reward_name);

  return v_claim_id;
end;
$$;

revoke all on function claim_reward(uuid, text, text, numeric, text) from public;
revoke all on function claim_reward(uuid, text, text, numeric, text) from anon;
revoke all on function claim_reward(uuid, text, text, numeric, text) from authenticated;
grant execute on function claim_reward(uuid, text, text, numeric, text) to service_role;

-- --------------------------------------------------------------- refund ----

-- Cancelling a claim cannot delete the original debit — the ledger is
-- append-only by design — so it writes a compensating credit instead. The
-- history stays honest: the spend happened, then it was refunded.
create or replace function cancel_reward_claim(
  p_claim_id    uuid,
  p_admin_id    uuid,
  p_admin_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role    user_role;
  v_user_id uuid;
  v_cost    numeric;
  v_status  claim_status;
begin
  select role into v_role from users where id = p_admin_id;
  if v_role is null or v_role <> 'admin' then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  select user_id, hours_cost, status into v_user_id, v_cost, v_status
  from reward_claims where id = p_claim_id for update;

  if v_user_id is null then
    raise exception 'claim not found' using errcode = 'P0002';
  end if;
  if v_status = 'cancelled' then
    raise exception 'claim already cancelled' using errcode = '55000';
  end if;

  update reward_claims
  set status = 'cancelled',
      admin_notes = nullif(btrim(coalesce(p_admin_notes, '')), '')
  where id = p_claim_id;

  insert into hour_transactions (user_id, amount, type, reference_id, note)
  values (v_user_id, v_cost, 'manual_adjustment', p_claim_id, 'Refund: claim cancelled');
end;
$$;

revoke all on function cancel_reward_claim(uuid, uuid, text) from public;
revoke all on function cancel_reward_claim(uuid, uuid, text) from anon;
revoke all on function cancel_reward_claim(uuid, uuid, text) from authenticated;
grant execute on function cancel_reward_claim(uuid, uuid, text) to service_role;
