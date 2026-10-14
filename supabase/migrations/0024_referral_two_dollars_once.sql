-- Referral reward is now $2, once per referred builder, paid on their first
-- approved project (at least min_approved_hours), instead of $1 per project.
-- Same safety: a unique index means a builder can only ever earn their
-- referrer one reward, however the approvals are retried or raced.

update referral_config set reward_cents = 200 where id;

-- rewards under the old $1-per-project rule (only test accounts have any) stay as rule 1;
-- the database allows one rule-2 reward per referred builder
alter table referral_rewards add column if not exists rule_version integer not null default 2;
update referral_rewards set rule_version = 1 where created_at < now();
create unique index if not exists referral_rewards_one_per_builder on referral_rewards (referred_id) where rule_version = 2;

create or replace function referral_pay_for_review(p_review_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  cfg      referral_config;
  r        submission_reviews;
  a        referral_attributions;
  names    text[];
  n        integer;
  hrs      numeric;
  rid      uuid;
  ref_u    users;
  red_u    users;
begin
  select * into cfg from referral_config where id;
  if not cfg.active then return 'program off'; end if;

  select * into r from submission_reviews where id = p_review_id;
  if r.id is null or r.status <> 'approved' then return 'not approved'; end if;

  select * into a from referral_attributions where referred_id = r.user_id for update;
  if a.referred_id is null then return 'not referred'; end if;
  if a.status <> 'active' then return 'attribution ' || a.status; end if;
  if coalesce(r.approved_hours, 0) < cfg.min_approved_hours then return 'under minimum hours'; end if;
  if r.reviewed_at is not null and r.reviewed_at < a.attributed_at then return 'approved before referral'; end if;

  -- flagged as possible fraud (either review path) never pays
  if exists (select 1 from review_flags f where (f.item_kind = 'hc' and f.item_key = r.airtable_record_id)
       or (f.item_kind = 'new' and f.item_key in (select q.id::text from submission_queue q where q.airtable_record_id = r.airtable_record_id))) then
    return 'flagged';
  end if;

  -- same person on both sides: hold for an admin
  select * into ref_u from users where id = a.referrer_id;
  select * into red_u from users where id = a.referred_id;
  if (normalise_email(ref_u.email) is not null and normalise_email(ref_u.email) = normalise_email(red_u.email))
     or (ref_u.slack_id is not null and ref_u.slack_id = red_u.slack_id) then
    update referral_attributions set status = 'held', flag = 'same email or Slack ID as referrer' where referred_id = a.referred_id;
    return 'held: same person';
  end if;

  names := array(select distinct lower(btrim(x)) from unnest(coalesce(nullif(r.hackatime_projects, '{}'), array[r.hackatime_project])) x where btrim(x) <> '');
  -- one reward per referred builder: their first eligible approval
  if exists (select 1 from referral_rewards w where w.referred_id = r.user_id and w.rule_version = 2) then
    return 'builder already earned';
  end if;

  -- the reward in hours, rounded so each referrer's running total stays exact to the cent
  select count(*) + 1 into n from referral_rewards where referrer_id = a.referrer_id;
  hrs := round(n * cfg.reward_cents::numeric / cfg.hour_value_cents, 2) - round((n - 1) * cfg.reward_cents::numeric / cfg.hour_value_cents, 2);

  insert into referral_rewards (referrer_id, referred_id, review_id, project_names, approved_hours, amount_cents, hours)
  values (a.referrer_id, r.user_id, r.id, names, r.approved_hours, cfg.reward_cents, hrs)
  on conflict do nothing
  returning id into rid;
  if rid is null then return 'already paid'; end if;

  insert into referral_reward_projects (referred_id, project_key, reward_id)
  select r.user_id, x, rid from unnest(names) x on conflict do nothing;

  insert into hour_transactions (user_id, amount, type, referral_reward_id, note)
  values (a.referrer_id, hrs, 'referral_reward', rid, 'Referral reward: a friend''s project was approved')
  on conflict do nothing;

  return 'paid';
end $$;

revoke all on function referral_pay_for_review(uuid) from public, anon, authenticated;
grant execute on function referral_pay_for_review(uuid) to service_role;
