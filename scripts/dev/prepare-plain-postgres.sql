-- Let the historical migration files replay on plain Postgres.
-- Those files GRANT and REVOKE for the role names Supabase creates
-- (anon, authenticated, service_role). They are not the role the app uses.
-- The app's role is `expedition`, created by deploy/postgrest/roles.sql.
-- Cutover does not replay these migrations; it restores a pg_dump.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end $$;
