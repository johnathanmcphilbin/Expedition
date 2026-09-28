-- 1. One Expedition project can be made of several Hackatime projects
--    (renamed folders, split front/back end...). Their tracked hours add up.
--    `project_name` / `hackatime_project` stay as the display name; the
--    list is the source of truth for which Hackatime projects are included.

alter table submission_queue add column if not exists hackatime_projects text[] not null default '{}';
update submission_queue set hackatime_projects = array[project_name] where hackatime_projects = '{}';

alter table submission_reviews add column if not exists hackatime_projects text[];

-- 2. Reopen a rejected review, back into the queue as pending. Rejected
--    reviews never paid anything, so there's nothing on the ledger to undo.
--    Approved stays final: hours were credited, and corrections go through
--    the admin ledger tool instead.

create or replace function reopen_review(p_review_id uuid, p_admin_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role   user_role;
  v_status submission_status;
begin
  select role into v_role from users where id = p_admin_id;
  if v_role is null or v_role <> 'admin' then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  select status into v_status from submission_reviews where id = p_review_id for update;
  if v_status is null then
    raise exception 'review not found' using errcode = 'P0002';
  end if;
  if v_status <> 'rejected' then
    raise exception 'only a rejected review can be reopened (this one is %)', v_status using errcode = '55000';
  end if;

  update submission_reviews
  set status = 'pending', reviewer_id = null, reviewed_at = null
  where id = p_review_id;
end;
$$;

revoke all on function reopen_review(uuid, uuid) from public;
revoke all on function reopen_review(uuid, uuid) from anon;
revoke all on function reopen_review(uuid, uuid) from authenticated;
grant execute on function reopen_review(uuid, uuid) to service_role;
