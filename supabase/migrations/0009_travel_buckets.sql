-- Split the Dublin travel fund into what it actually pays for: visa,
-- accommodation and flights. The participant picks the bucket when they
-- bank hours, and can move hours back out of a bucket until their fund is
-- locked.
--
-- Every travel_allocation row now names its bucket. No travel hours had
-- been banked when this ran, so no existing row needs one filled in (which
-- the append-only ledger wouldn't allow anyway).

create type travel_bucket as enum ('visa', 'accommodation', 'flights');

alter table hour_transactions add column travel_bucket travel_bucket;

alter table hour_transactions add constraint hour_transactions_bucket_matches_type check (
  (type = 'travel_allocation') = (travel_bucket is not null)
);

-- Hours banked per bucket, per user. Banking writes a negative row, so the
-- bucket total is the negated sum.
create view user_travel_buckets as
select
  u.id as user_id,
  coalesce(-sum(t.amount) filter (where t.travel_bucket = 'visa'), 0)          as visa,
  coalesce(-sum(t.amount) filter (where t.travel_bucket = 'accommodation'), 0) as accommodation,
  coalesce(-sum(t.amount) filter (where t.travel_bucket = 'flights'), 0)       as flights
from users u
left join hour_transactions t
  on t.user_id = u.id
 and t.type = 'travel_allocation'
group by u.id;

-- ------------------------------------------------------- bank / release ----

drop function if exists move_travel_hours(uuid, numeric);

-- p_hours > 0 banks into the bucket; p_hours < 0 moves hours back out of
-- that same bucket to the gear balance. Same locking as claim_reward.
create or replace function move_travel_hours(p_user_id uuid, p_hours numeric, p_bucket travel_bucket)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_found     boolean;
  v_locked    timestamptz;
  v_available numeric;
  v_in_bucket numeric;
begin
  if p_hours is null or p_hours = 0 then
    raise exception 'hours must be non-zero' using errcode = '22023';
  end if;
  if p_bucket is null then
    raise exception 'bucket is required' using errcode = '22023';
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
         coalesce(-sum(amount) filter (where type = 'travel_allocation' and travel_bucket = p_bucket), 0)
    into v_available, v_in_bucket
  from hour_transactions where user_id = p_user_id;

  if p_hours > 0 and v_available < p_hours then
    raise exception 'not enough hours: % available, % requested', v_available, p_hours
      using errcode = '22023';
  end if;
  if p_hours < 0 and v_in_bucket < -p_hours then
    raise exception 'not enough banked: % in %, % requested', v_in_bucket, p_bucket, -p_hours
      using errcode = '22023';
  end if;

  insert into hour_transactions (user_id, amount, type, travel_bucket, note)
  values (
    p_user_id,
    -p_hours,
    'travel_allocation',
    p_bucket,
    case when p_hours > 0 then 'Banked for Dublin: ' || p_bucket else 'Moved back from ' || p_bucket end
  );
end;
$$;

revoke all on function move_travel_hours(uuid, numeric, travel_bucket) from public;
revoke all on function move_travel_hours(uuid, numeric, travel_bucket) from anon;
revoke all on function move_travel_hours(uuid, numeric, travel_bucket) from authenticated;
grant execute on function move_travel_hours(uuid, numeric, travel_bucket) to service_role;
