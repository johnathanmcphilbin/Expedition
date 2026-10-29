-- For Hack Club's DAU dashboard: each Hackatime project alias a builder has
-- connected to Expedition, against their numeric Hackatime ID (what
-- expedition_projects.user_id can't give it: that's our own account id).
-- Real Hack Club accounts only. security_invoker so it follows the
-- permissions of whoever reads it, and nothing public can read it.
create or replace view dau_hackatime_projects
with (security_invoker = true) as
select
  c.hackatime_user_id,
  p.hackatime_project,
  p.created_at
from expedition_projects p
join hackatime_connections c on c.user_id = p.user_id
join users u on u.id = p.user_id
where c.hackatime_user_id is not null
  and u.hackclub_id like 'ident!%';

revoke all on dau_hackatime_projects from anon, authenticated;
