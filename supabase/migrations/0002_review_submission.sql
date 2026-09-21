-- Atomic, idempotent submission review.
--
-- Everything below happens inside ONE transaction (a Postgres function body is
-- implicitly transactional): permission check, self-review check, status guard,
-- review insert, submission update and — on approval — the ledger credit.
-- If any step raises, the whole thing rolls back and no hours are awarded.
--
-- Idempotency is enforced by unique indexes, not by application logic:
--   reviews_one_approval_per_submission
--   hour_transactions_one_credit_per_submission
-- A double-clicked approval hits one of those and is rejected by the database.

create or replace function review_submission(
  p_submission_id  uuid,
  p_reviewer_id    uuid,
  p_decision       review_decision,
  p_hours_approved numeric default null,
  p_feedback       text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reviewer_role  user_role;
  v_owner_id       uuid;
  v_status         submission_status;
  v_review_id      uuid;
begin
  -- 1. the reviewer must exist and actually be a reviewer or admin.
  --    Role is read from the database; it is never passed in from outside.
  select role into v_reviewer_role from users where id = p_reviewer_id;
  if v_reviewer_role is null then
    raise exception 'reviewer not found' using errcode = 'P0002';
  end if;
  if v_reviewer_role not in ('reviewer', 'admin') then
    raise exception 'not authorised to review' using errcode = '42501';
  end if;

  -- 2. lock the submission so two concurrent approvals serialise here
  select user_id, status into v_owner_id, v_status
  from submissions
  where id = p_submission_id
  for update;

  if v_owner_id is null then
    raise exception 'submission not found' using errcode = 'P0002';
  end if;

  -- 3. nobody reviews their own work, not even an admin
  if v_owner_id = p_reviewer_id then
    raise exception 'cannot review your own submission' using errcode = '42501';
  end if;

  -- 4. a settled submission cannot be re-decided
  if v_status in ('approved', 'rejected') then
    raise exception 'submission already %', v_status using errcode = '55000';
  end if;

  -- 5. approvals must carry a sane number of hours
  if p_decision = 'approved' then
    if p_hours_approved is null or p_hours_approved <= 0 then
      raise exception 'approved hours must be positive' using errcode = '22023';
    end if;
    if p_hours_approved > 200 then
      raise exception 'approved hours implausibly large' using errcode = '22023';
    end if;
  elsif p_hours_approved is not null then
    raise exception 'hours only apply to approvals' using errcode = '22023';
  end if;

  -- 6. record the review
  insert into reviews (submission_id, reviewer_id, decision, hours_approved, feedback)
  values (
    p_submission_id,
    p_reviewer_id,
    p_decision,
    case when p_decision = 'approved' then p_hours_approved else null end,
    nullif(btrim(coalesce(p_feedback, '')), '')
  )
  returning id into v_review_id;

  -- 7. move the submission to its new state
  update submissions
  set status = case p_decision
                 when 'approved'          then 'approved'::submission_status
                 when 'rejected'          then 'rejected'::submission_status
                 when 'changes_requested' then 'changes_requested'::submission_status
               end
  where id = p_submission_id;

  -- 8. credit the ledger, but only on approval
  if p_decision = 'approved' then
    insert into hour_transactions (user_id, amount, type, reference_id, note)
    values (
      v_owner_id,
      p_hours_approved,
      'checkpoint_approved',
      p_submission_id,
      'Checkpoint approved'
    );
  end if;

  return v_review_id;
end;
$$;

revoke all on function review_submission(uuid, uuid, review_decision, numeric, text) from public;
revoke all on function review_submission(uuid, uuid, review_decision, numeric, text) from anon;
revoke all on function review_submission(uuid, uuid, review_decision, numeric, text) from authenticated;
grant execute on function review_submission(uuid, uuid, review_decision, numeric, text) to service_role;
