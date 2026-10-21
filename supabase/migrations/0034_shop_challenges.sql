-- Shop challenges: the first N people to spend enough hours in the shop
-- since a challenge started win a prize. A prize is a free reward claim, so
-- it goes through fulfilment like anything else bought in the shop.

-- prizes cost nothing
alter table reward_claims drop constraint if exists reward_claims_cost_positive;
alter table reward_claims add constraint reward_claims_cost_not_negative check (hours_cost >= 0);

-- Award the prize if they've earned it and a spot is left. The advisory lock
-- serialises every award for this challenge, so two people at once can't
-- both take the last spot. True if they won just now.
create or replace function award_challenge(
  p_user_id  uuid,
  p_key      text,
  p_name     text,
  p_spots    int,
  p_spend    numeric,
  p_since    timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spent numeric;
begin
  perform pg_advisory_xact_lock(hashtext('challenge:' || p_key));

  if exists (select 1 from reward_claims where user_id = p_user_id and reward_key = p_key and status <> 'cancelled') then
    return false;
  end if;
  if (select count(*) from reward_claims where reward_key = p_key and status <> 'cancelled') >= p_spots then
    return false;
  end if;

  select coalesce(sum(hours_cost), 0) into v_spent
  from reward_claims
  where user_id = p_user_id and status <> 'cancelled' and created_at >= p_since and reward_key <> p_key;
  if v_spent < p_spend then
    return false;
  end if;

  insert into reward_claims (user_id, reward_key, reward_name, hours_cost, note)
  values (p_user_id, p_key, p_name, 0, 'Challenge prize');
  return true;
end;
$$;

revoke all on function award_challenge(uuid, text, text, int, numeric, timestamptz) from public;
revoke all on function award_challenge(uuid, text, text, int, numeric, timestamptz) from anon;
revoke all on function award_challenge(uuid, text, text, int, numeric, timestamptz) from authenticated;
grant execute on function award_challenge(uuid, text, text, int, numeric, timestamptz) to service_role;

-- Cancelling a free prize has nothing to refund (and the ledger has no
-- zero rows), so only refund what was actually spent.
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

  if v_cost > 0 then
    insert into hour_transactions (user_id, amount, type, reference_id, note)
    values (v_user_id, v_cost, 'manual_adjustment', p_claim_id, 'Refund: claim cancelled');
  end if;
end;
$$;
