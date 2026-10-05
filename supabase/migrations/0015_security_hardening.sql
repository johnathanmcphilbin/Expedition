-- 1. Approve-and-send lock. sendQueued stamps this before creating the
--    Airtable row, so a double click or two reviewers at once can't create
--    two rows and credit the hours twice. Cleared when the send finishes.
alter table submission_queue add column if not exists sending_at timestamptz;

-- 2. One live claim per reward tier per person, enforced by the database.
--    The app checks this too, but two requests fired at the same moment
--    could both pass that check before either inserted.
create unique index if not exists reward_claims_one_live_per_tier
  on reward_claims (user_id, reward_key)
  where status <> 'cancelled';

-- 3. Views run as their owner by default, which skips RLS. Supabase also
--    grants anon/authenticated access to new objects in public, so with a
--    leaked anon or publishable key these views would hand out every
--    user's hour totals. Make them obey RLS and take the grants away. The
--    SvelteKit server uses the service role, which is unaffected.
do $$
declare v record;
begin
  -- every view in public, whichever of them exist right now
  for v in select table_name from information_schema.views where table_schema = 'public' loop
    execute format('alter view public.%I set (security_invoker = true)', v.table_name);
    execute format('revoke all on public.%I from anon, authenticated', v.table_name);
  end loop;
end $$;

-- belt and braces: no table in public is for anon/authenticated either
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
