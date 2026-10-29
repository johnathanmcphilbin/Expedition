-- The DAU tool only lists real tables, not views, and matches a numeric
-- Hackatime ID. So instead of the view: a table of each Hackatime project
-- alias a builder has connected to Expedition, with their numeric Hackatime
-- ID, kept in step with expedition_projects and hackatime_connections by
-- triggers. Real Hack Club accounts only.
drop view if exists dau_hackatime_projects;

create table if not exists dau_hackatime_projects (
  user_id            uuid not null references users (id) on delete cascade,
  hackatime_user_id  bigint not null,
  hackatime_project  text not null,
  created_at         timestamptz not null,
  primary key (user_id, hackatime_project)
);

alter table dau_hackatime_projects enable row level security;
revoke all on dau_hackatime_projects from anon, authenticated;

-- rebuild one person's rows from the source tables
create or replace function refresh_dau_hackatime_projects(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from dau_hackatime_projects where user_id = p_user_id;
  insert into dau_hackatime_projects (user_id, hackatime_user_id, hackatime_project, created_at)
  select p.user_id, c.hackatime_user_id::bigint, p.hackatime_project, p.created_at
  from expedition_projects p
  join hackatime_connections c on c.user_id = p.user_id
  join users u on u.id = p.user_id
  where p.user_id = p_user_id
    and c.hackatime_user_id ~ '^\d+$'
    and u.hackclub_id like 'ident!%'
  on conflict do nothing;
$$;

revoke all on function refresh_dau_hackatime_projects(uuid) from public, anon, authenticated;

create or replace function dau_hackatime_projects_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform refresh_dau_hackatime_projects(old.user_id); end if;
  if tg_op in ('INSERT', 'UPDATE') then perform refresh_dau_hackatime_projects(new.user_id); end if;
  return null;
end;
$$;

drop trigger if exists dau_sync_projects on expedition_projects;
create trigger dau_sync_projects after insert or update or delete on expedition_projects
  for each row execute function dau_hackatime_projects_sync();

drop trigger if exists dau_sync_connections on hackatime_connections;
create trigger dau_sync_connections after insert or update of hackatime_user_id or delete on hackatime_connections
  for each row execute function dau_hackatime_projects_sync();

-- everyone so far
insert into dau_hackatime_projects (user_id, hackatime_user_id, hackatime_project, created_at)
select p.user_id, c.hackatime_user_id::bigint, p.hackatime_project, p.created_at
from expedition_projects p
join hackatime_connections c on c.user_id = p.user_id
join users u on u.id = p.user_id
where c.hackatime_user_id ~ '^\d+$'
  and u.hackclub_id like 'ident!%'
on conflict do nothing;
