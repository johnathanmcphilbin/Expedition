-- Expedition V1 schema.
--
-- Design notes:
--  * Identity comes from Hack Club Auth (auth.hackclub.com), NOT Supabase Auth.
--    `users.hackclub_id` is the OIDC `sub` claim.
--  * Hours are an APPEND-ONLY LEDGER. There is deliberately no mutable
--    `available_hours` column anywhere; balances are SUM(hour_transactions.amount).
--  * All writes go through the SvelteKit server using the service-role key, so
--    RLS is enabled with no permissive policies: anon/authenticated roles get
--    nothing, service_role bypasses RLS. This fails closed if a key ever leaks.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums ----

create type user_role as enum ('participant', 'reviewer', 'admin');

create type submission_status as enum (
  'pending',
  'in_review',
  'approved',
  'changes_requested',
  'rejected'
);

create type review_decision as enum ('approved', 'changes_requested', 'rejected');

-- Ledger entry kinds. Only `checkpoint_approved` is produced in V1; the others
-- exist so reward claiming / travel support can be added without a migration.
create type hour_transaction_type as enum (
  'checkpoint_approved',
  'reward_claimed',
  'travel_allocation',
  'manual_adjustment'
);

-- ---------------------------------------------------------------- users ----

create table users (
  id             uuid primary key default gen_random_uuid(),
  hackclub_id    text not null unique,
  slack_id       text,
  email          text,
  display_name   text,
  avatar_url     text,
  role           user_role not null default 'participant',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index users_role_idx on users (role);

-- ------------------------------------------------------------- sessions ----

-- Opaque server-side sessions. The cookie carries a random token; we only ever
-- store its SHA-256 hash, so a database leak does not hand over live sessions.
create table sessions (
  token_hash   text primary key,
  user_id      uuid not null references users (id) on delete cascade,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  user_agent   text,
  ip           text
);

create index sessions_user_id_idx on sessions (user_id);
create index sessions_expires_at_idx on sessions (expires_at);

-- ------------------------------------------- hackatime oauth connections ----

-- Evidence source only. Hackatime never awards hours by itself.
create table hackatime_connections (
  user_id           uuid primary key references users (id) on delete cascade,
  hackatime_user_id text,
  access_token      text not null,
  refresh_token     text,
  expires_at        timestamptz,
  scope             text,
  connected_at      timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ------------------------------------------------------------- projects ----

create table projects (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references users (id) on delete cascade,
  title              text not null,
  description        text,
  repo_url           text,
  demo_url           text,
  -- name of the Hackatime project this maps to, so a reviewer can line up
  -- tracked coding time with the checkpoint being reviewed
  hackatime_project  text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint projects_title_not_blank check (length(btrim(title)) > 0)
);

create index projects_user_id_idx on projects (user_id);

-- ---------------------------------------------------------- submissions ----

create table submissions (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects (id) on delete cascade,
  user_id          uuid not null references users (id) on delete cascade,
  hours_requested  numeric(6, 2) not null,
  description      text not null,
  status           submission_status not null default 'pending',
  submitted_at     timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint submissions_hours_positive check (hours_requested > 0 and hours_requested <= 200),
  constraint submissions_description_not_blank check (length(btrim(description)) > 0)
);

create index submissions_user_id_idx on submissions (user_id);
create index submissions_project_id_idx on submissions (project_id);
create index submissions_status_idx on submissions (status);
-- the review queue reads pending/in_review ordered by age
create index submissions_queue_idx on submissions (submitted_at)
  where status in ('pending', 'in_review');

-- ---------------------------------------------------------- attachments ----

-- Binaries live in Supabase Storage; Postgres only holds the pointer.
create table attachments (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references submissions (id) on delete cascade,
  storage_key    text not null unique,
  content_type   text not null,
  filename       text not null,
  size_bytes     integer not null,
  created_at     timestamptz not null default now(),
  constraint attachments_size_positive check (size_bytes > 0)
);

create index attachments_submission_id_idx on attachments (submission_id);

-- -------------------------------------------------------------- reviews ----

create table reviews (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references submissions (id) on delete cascade,
  reviewer_id    uuid not null references users (id) on delete restrict,
  decision       review_decision not null,
  hours_approved numeric(6, 2),
  feedback       text,
  created_at     timestamptz not null default now(),
  -- hours only make sense on an approval, and must be present there
  constraint reviews_hours_match_decision check (
    (decision = 'approved' and hours_approved is not null and hours_approved > 0)
    or (decision <> 'approved' and hours_approved is null)
  )
);

create index reviews_submission_id_idx on reviews (submission_id);
create index reviews_reviewer_id_idx on reviews (reviewer_id);

-- A submission can only ever carry ONE approval. This is the database-level
-- guarantee that a double-clicked / retried approval cannot pay out twice.
create unique index reviews_one_approval_per_submission
  on reviews (submission_id)
  where decision = 'approved';

-- ---------------------------------------------------- hour transactions ----

create table hour_transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users (id) on delete cascade,
  amount        numeric(6, 2) not null,
  type          hour_transaction_type not null,
  reference_id  uuid,
  note          text,
  created_at    timestamptz not null default now(),
  constraint hour_transactions_amount_nonzero check (amount <> 0),
  -- credits must be positive, debits negative: stops a sign mistake silently
  -- inverting the meaning of a ledger row
  constraint hour_transactions_sign_matches_type check (
    (type in ('checkpoint_approved') and amount > 0)
    or (type in ('reward_claimed', 'travel_allocation') and amount < 0)
    or type = 'manual_adjustment'
  )
);

create index hour_transactions_user_id_idx on hour_transactions (user_id);

-- Second idempotency guard: at most one checkpoint credit per submission,
-- independent of the reviews table.
create unique index hour_transactions_one_credit_per_submission
  on hour_transactions (reference_id)
  where type = 'checkpoint_approved';

-- The ledger is append-only at the DATABASE level, not merely by convention.
create or replace function reject_ledger_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'hour_transactions is append-only (attempted %)', tg_op;
end;
$$;

create trigger hour_transactions_no_update
  before update on hour_transactions
  for each row execute function reject_ledger_mutation();

create trigger hour_transactions_no_delete
  before delete on hour_transactions
  for each row execute function reject_ledger_mutation();

-- Balances are always derived, never stored.
create view user_hour_balances as
select
  u.id as user_id,
  coalesce(sum(t.amount) filter (where t.amount > 0), 0) as hours_earned,
  coalesce(-sum(t.amount) filter (where t.amount < 0), 0) as hours_spent,
  coalesce(sum(t.amount), 0) as hours_available
from users u
left join hour_transactions t on t.user_id = u.id
group by u.id;

-- ------------------------------------------------------- updated_at ----

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_touch before update on users
  for each row execute function touch_updated_at();
create trigger projects_touch before update on projects
  for each row execute function touch_updated_at();
create trigger submissions_touch before update on submissions
  for each row execute function touch_updated_at();
create trigger hackatime_connections_touch before update on hackatime_connections
  for each row execute function touch_updated_at();

-- ------------------------------------------------------------------ rls ----

-- Every table is RLS-enabled with zero policies. The anon and publishable keys
-- therefore read and write nothing at all. Only the service-role key used by
-- the SvelteKit server (which bypasses RLS) can touch this data.
alter table users                 enable row level security;
alter table sessions              enable row level security;
alter table hackatime_connections enable row level security;
alter table projects              enable row level security;
alter table submissions           enable row level security;
alter table attachments           enable row level security;
alter table reviews               enable row level security;
alter table hour_transactions     enable row level security;
