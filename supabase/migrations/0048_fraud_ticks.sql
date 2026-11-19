-- An admin can tick any submission off as checked for fraud. Reviewers see
-- the tick; only an admin can give or take one away. It doesn't hold
-- anything back: approving still goes straight to Hack Club.
--
-- Keyed like review_flags: 'new' by submission_queue.id, 'hc' by its Airtable
-- record id. A tick given while it was queued follows it once sent.
-- Additive only: a new table. Nothing existing is altered or dropped.

create table if not exists fraud_ticks (
  item_kind   text not null check (item_kind in ('hc', 'new')),
  item_key    text not null,
  checked_by  uuid references users (id) on delete set null,
  checked_at  timestamptz not null default now(),
  primary key (item_kind, item_key)
);

alter table fraud_ticks enable row level security;

-- Orchard may not have Supabase's anon/authenticated roles
do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated']
  loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on fraud_ticks from %I', role_name);
    end if;
  end loop;
end $$;

-- PostgREST on Orchard doesn't hear this (transaction pooler): restart it
-- after running this file so it can see the new table.
notify pgrst, 'reload schema';
