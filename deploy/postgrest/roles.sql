-- Roles for PostgREST in front of the Expedition database on Orchard.
--
-- Run on the TARGET only, after the schema exists (Import from URL, or a
-- pg_restore), and again after public.files is created. Safe to re-run.
-- It never connects to the source.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/postgrest/roles.sql
--
-- Optional dedicated login (only if you are not using the Orchard-injected
-- database user as PostgREST's connection role):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -v authenticator_password="$AUTHENTICATOR_PASSWORD" \
--     -f deploy/postgrest/roles.sql
--
-- The app JWT's role claim is `expedition` when this file can create that role,
-- and the database owner (POSTGREST_DB_ROLE) when it cannot.
--
-- Why this role can see rows when every table has RLS and no policies:
--   * If the role running this file is a superuser, `expedition` is created
--     BYPASSRLS. That is the same mechanism as Supabase's service_role, and
--     it does not skip triggers, so hour_transactions stays append-only.
--   * If it is not a superuser (typical of a managed database user), BYPASSRLS
--     cannot be granted. This file instead makes `expedition` the owner of the
--     app's public tables, views, sequences and functions. Owners bypass RLS
--     unless FORCE ROW LEVEL SECURITY is set, which it is not. SECURITY DEFINER
--     functions then run as expedition and can still write. Extension-owned
--     objects (pg_stat_statements, and anything supabase_vault left in public)
--     are not reassigned.
--
-- PostgREST connects as the user in DATABASE_URL (the Orchard resource binding)
-- and SET ROLE to the JWT role. This file grants `expedition` to that user
-- when it is allowed to. `expedition_anon` is created with no grants for a
-- local database where roles can be created, but the PostgREST image does not
-- set PGRST_DB_ANON_ROLE. A request with no JWT is rejected with 401.
--
-- An Import from URL may also bring Supabase-only objects: schemas `auth` and
-- `storage`, extensions `supabase_vault` and `pg_stat_statements`, and roles
-- `anon`, `authenticated`, `service_role`. This file does not create those
-- extensions or schemas and does not drop them. It only revokes their
-- privileges on schema public when the roles happen to exist.

\set ON_ERROR_STOP on

-- Orchard's app user (for example u_ysws_expedition_expedition) owns the
-- database and is not a superuser and does not have CREATEROLE. In that case
-- create no roles and grant nothing. PostgREST connects as this user and the
-- app JWT uses the same name (POSTGREST_DB_ROLE). The append-only trigger on
-- hour_transactions still fires for the table owner.
SELECT CASE WHEN rolsuper OR rolcreaterole THEN '1' ELSE '0' END AS can_create_roles
FROM pg_roles WHERE rolname = current_user
\gset
SELECT current_user AS orchard_user
\gset

\if :can_create_roles

select 'create role anon nologin'
where not exists (select 1 from pg_roles where rolname = 'anon')
\gexec

-- Kept so an older database still has the role. The PostgREST image does not
-- use it: PGRST_DB_ANON_ROLE stays unset and anonymous requests get 401.
select 'create role expedition_anon nologin'
where not exists (select 1 from pg_roles where rolname = 'expedition_anon')
\gexec

-- Imported Supabase roles already exist and the Orchard user may not be their
-- admin. A NOLOGIN anon is what we want, but do not fail the whole file if
-- this user cannot change that role.
do $$
begin
  execute 'alter role anon nologin';
exception
  when insufficient_privilege then
    raise notice 'left role anon unchanged';
end $$;

-- expedition: create first without BYPASSRLS so a non-superuser can create it.
-- A superuser run then adds BYPASSRLS below.
select 'create role expedition nologin'
where not exists (select 1 from pg_roles where rolname = 'expedition')
\gexec

do $$
declare
  is_super boolean;
  obj record;
begin
  select rolsuper into is_super from pg_roles where rolname = current_user;

  if is_super then
    execute 'alter role expedition nologin bypassrls';
  else
    -- Ownership can only be handed to a role we can SET ROLE to. The creator
    -- of expedition has that admin option; a member already granted it does too.
    if current_user is distinct from 'expedition' then
      begin
        execute format('grant expedition to %I', current_user);
      exception
        when insufficient_privilege then
          raise notice 'could not grant expedition to %', current_user;
      end;
    end if;
    -- The new owner must itself be allowed to create objects in the schema.
    execute 'grant usage, create on schema public to expedition';
    -- Owner bypasses RLS. Leave extension objects (pg_stat_statements, vault)
    -- on their current owner.
    for obj in
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
        and not exists (
          select 1 from pg_depend d
          where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e'
        )
    loop
      execute format('alter table public.%I owner to expedition', obj.relname);
    end loop;

    for obj in
      select p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prokind = 'f'
        and not exists (
          select 1 from pg_depend d
          where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
        )
    loop
      execute format('alter function public.%I(%s) owner to expedition', obj.proname, obj.args);
    end loop;
  end if;
end $$;

\if :{?authenticator_password}
select format('create role authenticator noinherit login password %L', :'authenticator_password')
where not exists (select 1 from pg_roles where rolname = 'authenticator')
\gexec
alter role authenticator with noinherit login password :'authenticator_password';
grant expedition_anon to authenticator;
grant expedition to authenticator;
do $$
begin
  execute 'grant anon to authenticator';
exception
  when insufficient_privilege then
    raise notice 'could not grant imported anon to authenticator';
end $$;
\endif

-- The Orchard-bound user (whoever is running this file) must be able to SET ROLE.
do $$
begin
  if current_user is distinct from 'expedition_anon' then
    execute format('grant expedition_anon to %I', current_user);
  end if;
  if current_user is distinct from 'expedition' then
    begin
      execute format('grant expedition to %I', current_user);
    exception
      when insufficient_privilege then
        raise notice 'could not grant expedition to %', current_user;
    end;
  end if;
  if current_user is distinct from 'anon' then
    begin
      execute format('grant anon to %I', current_user);
    exception
      when insufficient_privilege then
        raise notice 'could not grant imported anon to %', current_user;
    end;
  end if;
end $$;

revoke all on schema public from public;
grant usage on schema public to expedition;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'grant usage on schema public to authenticator';
  end if;
end $$;

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated', 'service_role', 'expedition_anon']
  loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      begin
        execute format('revoke all on schema public from %I', role_name);
        execute format('revoke all on all tables in schema public from %I', role_name);
        execute format('revoke all on all sequences in schema public from %I', role_name);
        execute format('revoke all on all functions in schema public from %I', role_name);
      exception
        when insufficient_privilege then
          raise notice 'could not revoke public privileges from %', role_name;
      end;
    end if;
  end loop;
end $$;

revoke all on all tables in schema public from public;
revoke all on all sequences in schema public from public;
revoke all on all functions in schema public from public;

grant all privileges on all tables in schema public to expedition;
grant all privileges on all sequences in schema public to expedition;
grant execute on all functions in schema public to expedition;

alter default privileges in schema public revoke all on tables from public;
alter default privileges in schema public revoke all on sequences from public;
alter default privileges in schema public revoke all on functions from public;
alter default privileges in schema public grant all on tables to expedition;
alter default privileges in schema public grant all on sequences to expedition;
alter default privileges in schema public grant execute on functions to expedition;

-- Harmless if PostgREST is not listening. The Orchard pooler is transaction
-- mode, so PostgREST runs with db-channel-enabled off and will not see this;
-- restart the PostgREST app after schema changes.
notify pgrst, 'reload schema';

\else
\echo SKIP roles: :orchard_user has neither CREATEROLE nor superuser.
\echo No roles were created and no grants were attempted.
\echo Do not set PGRST_DB_ANON_ROLE. Leave it unset so a request with no JWT returns 401.
\echo Set POSTGREST_DB_ROLE to :orchard_user so the app JWT role claim is this login.
\echo hour_transactions stays append-only because the trigger fires for the table owner.
\endif
