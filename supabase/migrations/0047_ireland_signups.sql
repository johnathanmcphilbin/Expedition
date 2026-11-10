-- Irish student sign-ups for the Galway hackathon.
-- Additive only: new tables and functions. Nothing existing is altered or dropped.
--
-- Sign-ups are closed until an admin opens them (or IRELAND_SIGNUPS_OPEN is set).
-- Capacity defaults to 30. Approved + pending hold a spot; past that, new
-- sign-ups are waitlisted. The app passes the effective capacity and open flag
-- (environment overrides the row) into the functions below.
--
-- RLS is on with no policies, same as every other table. The PostgREST role
-- bypasses it. Anonymous requests never reach Postgres.

create table ireland_signup_settings (
  id            int primary key default 1 check (id = 1),
  signups_open  boolean not null default false,
  capacity      int not null default 30 check (capacity >= 0 and capacity <= 10000),
  updated_at    timestamptz not null default now()
);

insert into ireland_signup_settings (id, signups_open, capacity)
values (1, false, 30)
on conflict (id) do nothing;

create trigger ireland_signup_settings_touch
  before update on ireland_signup_settings
  for each row execute function touch_updated_at();

create table ireland_signups (
  id                          uuid primary key default gen_random_uuid(),
  name                        text not null check (char_length(name) between 2 and 80),
  email                       text not null check (
                                email = lower(email)
                                and char_length(email) <= 320
                                and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
                              ),
  age                         int not null check (age between 13 and 18),
  school                      text not null check (char_length(school) between 2 and 120),
  county                      text not null check (char_length(county) between 2 and 40),
  github_username             text check (github_username is null or char_length(github_username) between 1 and 39),
  built_note                  text check (built_note is null or char_length(built_note) <= 2000),
  built_url                   text check (built_url is null or char_length(built_url) <= 2000),
  status                      text not null default 'pending' check (
                                status in ('pending', 'approved', 'rejected', 'waitlist')
                              ),
  ip_hash                     text,
  attend_participant_event_id text,
  attend_synced_at            timestamptz,
  attend_error                text,
  decided_at                  timestamptz,
  decided_by                  uuid references users (id),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create unique index ireland_signups_email_idx on ireland_signups (email);
create index ireland_signups_status_created_idx on ireland_signups (status, created_at);
create index ireland_signups_ip_created_idx on ireland_signups (ip_hash, created_at);

create trigger ireland_signups_touch
  before update on ireland_signups
  for each row execute function touch_updated_at();

-- Emails collected while sign-ups are closed, so we can tell people when they open.
create table ireland_notify_emails (
  email      text primary key check (
               email = lower(email)
               and char_length(email) <= 320
               and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
             ),
  ip_hash    text,
  created_at timestamptz not null default now()
);

create index ireland_notify_ip_created_idx on ireland_notify_emails (ip_hash, created_at);

alter table ireland_signup_settings enable row level security;
alter table ireland_signups enable row level security;
alter table ireland_notify_emails enable row level security;

-- Move the oldest waitlisted people into pending while approved+pending is under capacity.
create or replace function ireland_fill_waitlist(p_capacity int) returns int
language plpgsql
as $$
declare
  holding int;
  nxt uuid;
  promoted int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('ireland_signups'));
  if p_capacity is null or p_capacity < 0 then
    return 0;
  end if;

  loop
    select count(*) into holding
    from ireland_signups
    where status in ('pending', 'approved');
    exit when holding >= p_capacity;

    select id into nxt
    from ireland_signups
    where status = 'waitlist'
    order by created_at asc, id asc
    limit 1;
    exit when nxt is null;

    update ireland_signups
      set status = 'pending',
          decided_at = null,
          decided_by = null
      where id = nxt
        and status = 'waitlist';
    promoted := promoted + 1;
    exit when promoted > 10000;
  end loop;

  return promoted;
end;
$$;

create or replace function ireland_create_signup(
  p_name text,
  p_email text,
  p_age int,
  p_school text,
  p_county text,
  p_github text,
  p_built_note text,
  p_built_url text,
  p_ip_hash text,
  p_capacity int,
  p_open boolean,
  p_rate_limit int,
  p_window_secs int
) returns jsonb
language plpgsql
as $$
declare
  holding int;
  recent int;
  new_status text;
  new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('ireland_signups'));

  if coalesce(p_open, false) = false then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;

  if exists (select 1 from ireland_signups where email = lower(p_email)) then
    return jsonb_build_object('ok', false, 'error', 'duplicate');
  end if;

  if p_ip_hash is not null and p_ip_hash <> '' and coalesce(p_rate_limit, 0) > 0 then
    select count(*) into recent
    from ireland_signups
    where ip_hash = p_ip_hash
      and created_at > now() - make_interval(secs => greatest(coalesce(p_window_secs, 3600), 1));
    if recent >= p_rate_limit then
      return jsonb_build_object('ok', false, 'error', 'rate');
    end if;
  end if;

  -- Waitlisted people take a freed spot before a brand new sign-up does.
  perform ireland_fill_waitlist(p_capacity);

  select count(*) into holding
  from ireland_signups
  where status in ('pending', 'approved');

  if holding >= coalesce(p_capacity, 0) then
    new_status := 'waitlist';
  else
    new_status := 'pending';
  end if;

  insert into ireland_signups (
    name, email, age, school, county, github_username, built_note, built_url, status, ip_hash
  ) values (
    p_name,
    lower(p_email),
    p_age,
    p_school,
    p_county,
    nullif(p_github, ''),
    nullif(p_built_note, ''),
    nullif(p_built_url, ''),
    new_status,
    nullif(p_ip_hash, '')
  )
  returning id into new_id;

  return jsonb_build_object('ok', true, 'id', new_id, 'status', new_status);
end;
$$;

create or replace function ireland_set_status(
  p_id uuid,
  p_status text,
  p_override boolean,
  p_admin uuid,
  p_capacity int
) returns jsonb
language plpgsql
as $$
declare
  row ireland_signups%rowtype;
  approved_count int;
  promoted int;
begin
  if p_status not in ('approved', 'rejected') then
    return jsonb_build_object('ok', false, 'error', 'status');
  end if;

  perform pg_advisory_xact_lock(hashtext('ireland_signups'));

  select * into row from ireland_signups where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'missing');
  end if;

  if p_status = 'approved' and row.status <> 'approved' then
    select count(*) into approved_count
    from ireland_signups
    where status = 'approved'
      and id <> p_id;
    if approved_count >= coalesce(p_capacity, 0) and coalesce(p_override, false) = false then
      return jsonb_build_object(
        'ok', false,
        'error', 'capacity',
        'approved', approved_count,
        'capacity', p_capacity
      );
    end if;
  end if;

  if row.status is distinct from p_status then
    update ireland_signups
      set status = p_status,
          decided_at = now(),
          decided_by = p_admin
      where id = p_id;
  end if;

  promoted := ireland_fill_waitlist(p_capacity);
  return jsonb_build_object('ok', true, 'status', p_status, 'promoted', promoted);
end;
$$;

revoke all on function ireland_fill_waitlist(int) from public;
revoke all on function ireland_create_signup(text, text, int, text, text, text, text, text, text, int, boolean, int, int) from public;
revoke all on function ireland_set_status(uuid, text, boolean, uuid, int) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'expedition') then
    grant all on ireland_signup_settings to expedition;
    grant all on ireland_signups to expedition;
    grant all on ireland_notify_emails to expedition;
    grant execute on function ireland_fill_waitlist(int) to expedition;
    grant execute on function ireland_create_signup(text, text, int, text, text, text, text, text, text, int, boolean, int, int) to expedition;
    grant execute on function ireland_set_status(uuid, text, boolean, uuid, int) to expedition;
  end if;
end $$;
