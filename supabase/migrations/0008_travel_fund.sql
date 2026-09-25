-- Banking approved hours toward travel to Dublin.
--
-- A participant moves hours out of their gear balance into a travel fund
-- (valued at $8.50/hour in the app — the rate lives in src/lib/data.ts, not
-- here, so it can change without a migration). They can move hours back
-- until an organiser locks their fund, which is what happens once travel is
-- actually being arranged for them.
--
-- Both directions are ordinary ledger rows of the existing
-- `travel_allocation` type: negative when banking, positive when released.
-- The ledger stays append-only; the fund is always derived, never stored.

-- ----------------------------------------------------------------- lock ----

alter table users add column travel_locked_at timestamptz;

-- ------------------------------------------------------- sign rule ----

-- travel_allocation was debit-only; releasing hours back is a credit of the
-- same kind, so it may now be either sign (never zero — that's still the
-- amount_nonzero constraint's job).
alter table hour_transactions drop constraint hour_transactions_sign_matches_type;
alter table hour_transactions add constraint hour_transactions_sign_matches_type check (
  (type = 'checkpoint_approved' and amount > 0)
  or (type = 'reward_claimed' and amount < 0)
  or type in ('travel_allocation', 'manual_adjustment')
);

-- ----------------------------------------------------------- balances ----

-- Travel moves are not earning or spending: excluded from both, reported in
-- their own column. hours_available still nets everything, so banked hours
-- can't also be spent on gear. (New columns may only be appended to a view.)
create or replace view user_hour_balances as
select
  u.id as user_id,
  coalesce(sum(t.amount) filter (where t.amount > 0 and t.type <> 'travel_allocation'), 0) as hours_earned,
  coalesce(-sum(t.amount) filter (where t.amount < 0 and t.type <> 'travel_allocation'), 0) as hours_spent,
  coalesce(sum(t.amount), 0) as hours_available,
  coalesce(-sum(t.amount) filter (where t.type = 'travel_allocation'), 0) as hours_travel,
  u.travel_locked_at
from users u
left join hour_transactions t on t.user_id = u.id
group by u.id;

-- ------------------------------------------------------- bank / release ----

-- p_hours > 0 banks that many hours into the travel fund; p_hours < 0 moves
-- them back to the gear balance. Same locking pattern as claim_reward: lock
-- the user row, recompute from the ledger inside the transaction, then write.
create or replace function move_travel_hours(p_user_id uuid, p_hours numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked    timestamptz;
  v_found     boolean;
  v_available numeric;
  v_travel    numeric;
begin
  if p_hours is null or p_hours = 0 then
    raise exception 'hours must be non-zero' using errcode = '22023';
  end if;

  select true, travel_locked_at into v_found, v_locked
  from users where id = p_user_id for update;
  if v_found is null then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if v_locked is not null then
    raise exception 'travel fund is locked' using errcode = '55000';
  end if;

  select coalesce(sum(amount), 0),
         coalesce(-sum(amount) filter (where type = 'travel_allocation'), 0)
    into v_available, v_travel
  from hour_transactions where user_id = p_user_id;

  if p_hours > 0 and v_available < p_hours then
    raise exception 'not enough hours: % available, % requested', v_available, p_hours
      using errcode = '22023';
  end if;
  if p_hours < 0 and v_travel < -p_hours then
    raise exception 'not enough banked: % in travel fund, % requested', v_travel, -p_hours
      using errcode = '22023';
  end if;

  insert into hour_transactions (user_id, amount, type, note)
  values (
    p_user_id,
    -p_hours,
    'travel_allocation',
    case when p_hours > 0 then 'Banked for Dublin travel' else 'Moved back from travel fund' end
  );
end;
$$;

revoke all on function move_travel_hours(uuid, numeric) from public;
revoke all on function move_travel_hours(uuid, numeric) from anon;
revoke all on function move_travel_hours(uuid, numeric) from authenticated;
grant execute on function move_travel_hours(uuid, numeric) to service_role;
