-- Referrals: every participant gets a code; someone new who joins through
-- it is attributed to them, permanently; the referrer earns $1 (in hours,
-- at the travel rate) for each different project that person gets approved.
-- Run 0022 first.

-- ---------------------------------------------------------------- settings
create table if not exists referral_config (
  id                  boolean primary key default true check (id),
  reward_cents        integer not null default 100,   -- per eligible approved project
  min_approved_hours  numeric(6, 2) not null default 2, -- keeps $1 inside the $0.50/h margin
  hour_value_cents    integer not null default 800,   -- what an hour is worth (travel rate)
  budget_cents_per_hour integer not null default 850, -- program budget per approved hour
  window_days         integer not null default 30,    -- how long a click is remembered
  active              boolean not null default true
);
insert into referral_config (id) values (true) on conflict do nothing;

-- ------------------------------------------------------------------- codes
create table if not exists referral_codes (
  code        text primary key check (code ~ '^[a-z0-9]{8}$'),
  user_id     uuid not null unique references users (id) on delete cascade,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create or replace function new_referral_code() returns text language plpgsql as $$
declare c text; i integer;
begin
  loop
    -- 8 random lowercase letters/digits; built-ins only (no extension needed)
    c := '';
    for i in 1..8 loop
      c := c || substr('abcdefghijklmnopqrstuvwxyz0123456789', 1 + floor(random() * 36)::int, 1);
    end loop;
    exit when not exists (select 1 from referral_codes where code = c);
  end loop;
  return c;
end $$;

-- every existing participant gets one (they can refer; they're never referred)
insert into referral_codes (code, user_id)
select new_referral_code(), u.id from users u
where not exists (select 1 from referral_codes r where r.user_id = u.id);

-- and every new account gets one as it's created
create or replace function users_give_referral_code() returns trigger language plpgsql as $$
begin
  insert into referral_codes (code, user_id) values (new_referral_code(), new.id) on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists users_referral_code on users;
create trigger users_referral_code after insert on users for each row execute function users_give_referral_code();

-- ------------------------------------------------------------- attribution
create table if not exists referral_attributions (
  referred_id    uuid primary key references users (id) on delete cascade, -- one referrer, ever
  referrer_id    uuid not null references users (id) on delete cascade,
  code           text not null references referral_codes (code),
  source         text not null default 'link',
  clicked_at     timestamptz,                        -- the first-touch click
  attributed_at  timestamptz not null default now(), -- their Expedition account was created
  status         text not null default 'active' check (status in ('active', 'held', 'rejected')),
  flag           text,                               -- why it's held / rejected
  constraint referral_not_self check (referrer_id <> referred_id)
);
create index if not exists referral_attributions_referrer_idx on referral_attributions (referrer_id);

-- ------------------------------------------------------------------ events
-- Counts only: a click carries a random per-browser id, stored hashed, for
-- approximate unique visitors. No IPs, no fingerprints.
create table if not exists referral_events (
  id            bigserial primary key,
  code          text not null references referral_codes (code) on delete cascade,
  type          text not null check (type in ('click', 'signup')),
  visitor_hash  text,
  created_at    timestamptz not null default now()
);
create index if not exists referral_events_code_idx on referral_events (code, type);

-- ----------------------------------------------------------------- rewards
create table if not exists referral_rewards (
  id              uuid primary key default gen_random_uuid(),
  referrer_id     uuid not null references users (id) on delete cascade,
  referred_id     uuid not null references users (id) on delete cascade,
  review_id       uuid not null,                     -- the approval that earned it
  project_names   text[] not null,
  approved_hours  numeric(6, 2) not null,
  amount_cents    integer not null,
  hours           numeric(6, 2) not null,            -- what was credited (rounded to the ledger's 2dp)
  status          text not null default 'earned' check (status in ('earned', 'reversed')),
  note            text,
  created_at      timestamptz not null default now(),
  reversed_at     timestamptz,
  unique (review_id)
);
-- each Hackatime project of a referred builder can earn once, ever
create table if not exists referral_reward_projects (
  referred_id   uuid not null references users (id) on delete cascade,
  project_key   text not null,
  reward_id     uuid not null references referral_rewards (id) on delete cascade,
  primary key (referred_id, project_key)
);

alter table hour_transactions add column if not exists referral_reward_id uuid references referral_rewards (id);
create unique index if not exists hour_transactions_one_per_referral
  on hour_transactions (referral_reward_id, type) where referral_reward_id is not null;

alter table hour_transactions drop constraint hour_transactions_sign_matches_type;
alter table hour_transactions add constraint hour_transactions_sign_matches_type check (
  (type = 'checkpoint_approved' and amount > 0)
  or (type = 'reward_claimed' and amount < 0)
  or (type = 'referral_reward' and amount > 0)
  or (type = 'referral_reversal' and amount < 0)
  or type in ('travel_allocation', 'manual_adjustment')
);

-- --------------------------------------------------------------- audit log
create table if not exists admin_actions (
  id          bigserial primary key,
  admin_id    uuid references users (id) on delete set null,
  action      text not null,
  target      text,
  note        text,
  created_at  timestamptz not null default now()
);

-- -------------------------------------------------------- same person check
create or replace function normalise_email(e text) returns text language sql immutable as $$
  select case
    when e is null then null
    when split_part(lower(e), '@', 2) in ('gmail.com', 'googlemail.com')
      then replace(split_part(split_part(lower(e), '@', 1), '+', 1), '.', '') || '@gmail.com'
    else split_part(split_part(lower(e), '@', 1), '+', 1) || '@' || split_part(lower(e), '@', 2)
  end
$$;

-- ------------------------------------------------------------------ payout
-- Pays the referrer for one approved review, exactly once. Safe to call any
-- number of times, concurrently: locks the attribution row, then claims each
-- project name and the review under unique keys. Returns what happened.
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
  if exists (select 1 from referral_reward_projects p where p.referred_id = r.user_id and p.project_key = any(names)) then
    return 'project already earned';
  end if;
  if exists (select 1 from referral_rewards w where w.review_id = r.id) then return 'already paid'; end if;

  -- $1 in hours, rounded so each referrer's running total stays exact to the cent
  select count(*) + 1 into n from referral_rewards where referrer_id = a.referrer_id;
  hrs := round(n * cfg.reward_cents::numeric / cfg.hour_value_cents, 2) - round((n - 1) * cfg.reward_cents::numeric / cfg.hour_value_cents, 2);

  insert into referral_rewards (referrer_id, referred_id, review_id, project_names, approved_hours, amount_cents, hours)
  values (a.referrer_id, r.user_id, r.id, names, r.approved_hours, cfg.reward_cents, hrs)
  on conflict (review_id) do nothing
  returning id into rid;
  if rid is null then return 'already paid'; end if;

  insert into referral_reward_projects (referred_id, project_key, reward_id)
  select r.user_id, x, rid from unnest(names) x on conflict do nothing;

  insert into hour_transactions (user_id, amount, type, referral_reward_id, note)
  values (a.referrer_id, hrs, 'referral_reward', rid, 'Referral reward: a friend''s project was approved')
  on conflict do nothing;

  return 'paid';
end $$;

-- Re-check every approved review of a referred builder. Idempotent.
create or replace function referral_reconcile() returns integer
language plpgsql security definer set search_path = public as $$
declare v record; paid integer := 0;
begin
  for v in
    select r.id from submission_reviews r join referral_attributions a on a.referred_id = r.user_id
    where r.status = 'approved' and not exists (select 1 from referral_rewards w where w.review_id = r.id)
    order by r.reviewed_at
  loop
    if referral_pay_for_review(v.id) = 'paid' then paid := paid + 1; end if;
  end loop;
  return paid;
end $$;

-- Undo a reward with a negative row; the original stays.
create or replace function referral_reverse(p_reward_id uuid, p_admin_id uuid, p_note text) returns boolean
language plpgsql security definer set search_path = public as $$
declare w referral_rewards;
begin
  select * into w from referral_rewards where id = p_reward_id for update;
  if w.id is null or w.status <> 'earned' then return false; end if;
  insert into hour_transactions (user_id, amount, type, referral_reward_id, note)
  values (w.referrer_id, -w.hours, 'referral_reversal', w.id, coalesce('Referral reward reversed: ' || p_note, 'Referral reward reversed'))
  on conflict do nothing;
  update referral_rewards set status = 'reversed', reversed_at = now(), note = p_note where id = w.id;
  insert into admin_actions (admin_id, action, target, note) values (p_admin_id, 'reverse_referral_reward', w.id::text, p_note);
  return true;
end $$;

-- --------------------------------------------- hook into the approval itself
-- Same function as 0020, plus: reviewers can't decide work by someone they
-- referred, and an approval pays any referral reward in a savepoint so a
-- referral problem can never fail or roll back the approval.
create or replace function review_hackclub_submission(
  p_review_id             uuid,
  p_reviewer_id           uuid,
  p_status                submission_status,
  p_approved_hours        numeric default null,
  p_internal_notes        text default null,
  p_participant_feedback  text default null,
  p_submitted_hours       numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reviewer_role   user_role;
  v_owner_id        uuid;
  v_current_status  submission_status;
begin
  select role into v_reviewer_role from users where id = p_reviewer_id;
  if v_reviewer_role is null then
    raise exception 'reviewer not found' using errcode = 'P0002';
  end if;
  if v_reviewer_role not in ('admin', 'reviewer') then
    raise exception 'not authorised to review' using errcode = '42501';
  end if;

  select user_id, status into v_owner_id, v_current_status
  from submission_reviews where id = p_review_id for update;
  if v_owner_id is null then
    raise exception 'review not found' using errcode = 'P0002';
  end if;
  if v_owner_id = p_reviewer_id then
    raise exception 'cannot review your own submission' using errcode = '42501';
  end if;
  if exists (select 1 from referral_attributions where referred_id = v_owner_id and referrer_id = p_reviewer_id) then
    raise exception 'cannot review someone you referred' using errcode = '42501';
  end if;
  if v_current_status in ('approved', 'rejected') then
    raise exception 'review already %', v_current_status using errcode = '55000';
  end if;
  if p_status = 'approved' then
    if p_approved_hours is null or p_approved_hours <= 0 then
      raise exception 'approved hours must be positive' using errcode = '22023';
    end if;
  end if;
  if p_approved_hours is not null and p_approved_hours > 200 then
    raise exception 'approved hours implausibly large' using errcode = '22023';
  end if;

  update submission_reviews set
    status = p_status,
    approved_hours = coalesce(p_approved_hours, approved_hours),
    submitted_hours = coalesce(p_submitted_hours, submitted_hours),
    internal_notes = nullif(btrim(coalesce(p_internal_notes, '')), ''),
    participant_feedback = nullif(btrim(coalesce(p_participant_feedback, '')), ''),
    reviewer_id = case when p_status <> 'pending' then p_reviewer_id else reviewer_id end,
    reviewed_at = case when p_status <> 'pending' then now() else reviewed_at end
  where id = p_review_id;

  if p_status = 'approved' then
    insert into hour_transactions (user_id, amount, type, reference_id, note)
    values (v_owner_id, p_approved_hours, 'checkpoint_approved', p_review_id, 'Hack Club submission approved');

    begin
      perform referral_pay_for_review(p_review_id);
    exception when others then
      raise warning 'referral payout skipped for review %: %', p_review_id, sqlerrm;
    end;
  end if;

  return p_review_id;
end;
$$;

revoke all on function review_hackclub_submission(uuid, uuid, submission_status, numeric, text, text, numeric) from public, anon, authenticated;
grant execute on function review_hackclub_submission(uuid, uuid, submission_status, numeric, text, text, numeric) to service_role;
revoke all on function referral_pay_for_review(uuid) from public, anon, authenticated;
revoke all on function referral_reconcile() from public, anon, authenticated;
revoke all on function referral_reverse(uuid, uuid, text) from public, anon, authenticated;
grant execute on function referral_pay_for_review(uuid), referral_reconcile(), referral_reverse(uuid, uuid, text) to service_role;

alter table referral_config enable row level security;
alter table referral_codes enable row level security;
alter table referral_attributions enable row level security;
alter table referral_events enable row level security;
alter table referral_rewards enable row level security;
alter table referral_reward_projects enable row level security;
alter table admin_actions enable row level security;
revoke all on referral_config, referral_codes, referral_attributions, referral_events, referral_rewards, referral_reward_projects, admin_actions from anon, authenticated;
