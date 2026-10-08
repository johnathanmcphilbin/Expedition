-- Reviewers (not just admins) can decide submissions now. The app already
-- lets them in (requireReviewer), but this function still only accepted
-- admins, so a reviewer's approval failed with "not authorised to review".
-- Same function as 0004, with only the role check widened.
create or replace function review_hackclub_submission(
  p_review_id             uuid,
  p_reviewer_id           uuid,
  p_status                submission_status,
  p_approved_hours        numeric default null,
  p_internal_notes        text default null,
  p_participant_feedback  text default null,
  p_submitted_hours       numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reviewer_role   user_role;
  v_owner_id        uuid;
  v_current_status  submission_status;
begin
  -- 1. admins and reviewers (the review queue is open to both; see
  --    requireReviewer in guards.ts). Participants never.
  select role into v_reviewer_role from users where id = p_reviewer_id;
  if v_reviewer_role is null then
    raise exception 'reviewer not found' using errcode = 'P0002';
  end if;
  if v_reviewer_role not in ('admin', 'reviewer') then
    raise exception 'not authorised to review' using errcode = '42501';
  end if;

  -- 2. lock the review row so two concurrent decisions serialise here
  select user_id, status into v_owner_id, v_current_status
  from submission_reviews
  where id = p_review_id
  for update;

  if v_owner_id is null then
    raise exception 'review not found' using errcode = 'P0002';
  end if;

  -- 3. nobody reviews their own submission, not even an admin
  if v_owner_id = p_reviewer_id then
    raise exception 'cannot review your own submission' using errcode = '42501';
  end if;

  -- 4. approved/rejected are terminal — a correction goes through the
  --    admin ledger tool (manual_adjustment) instead of silently rewriting
  --    history. changes_requested is NOT terminal: the reviewer may come
  --    back once the participant has addressed it.
  if v_current_status in ('approved', 'rejected') then
    raise exception 'review already %', v_current_status using errcode = '55000';
  end if;

  -- 5. an approval must carry a sane number of hours. A non-approved status
  --    may still carry a draft number (e.g. jotted down before deciding) —
  --    only what actually pays out is constrained.
  if p_status = 'approved' then
    if p_approved_hours is null or p_approved_hours <= 0 then
      raise exception 'approved hours must be positive' using errcode = '22023';
    end if;
  end if;
  if p_approved_hours is not null and p_approved_hours > 200 then
    raise exception 'approved hours implausibly large' using errcode = '22023';
  end if;

  -- approved_hours is stored whenever given, not only on a final approval —
  -- "Save Review" while still pending can jot down a draft number without
  -- it vanishing. Only the ledger credit below is gated on p_status.
  -- reviewer_id/reviewed_at only move on an actual decision, not a draft
  -- save while still pending — they mean "who decided this and when", not
  -- "who last touched it".
  update submission_reviews set
    status = p_status,
    approved_hours = coalesce(p_approved_hours, approved_hours),
    -- refreshed from a live Hackatime call by the caller on every save, so
    -- the stored figure reflects what the reviewer actually saw
    submitted_hours = coalesce(p_submitted_hours, submitted_hours),
    internal_notes = nullif(btrim(coalesce(p_internal_notes, '')), ''),
    participant_feedback = nullif(btrim(coalesce(p_participant_feedback, '')), ''),
    reviewer_id = case when p_status <> 'pending' then p_reviewer_id else reviewer_id end,
    reviewed_at = case when p_status <> 'pending' then now() else reviewed_at end
  where id = p_review_id;

  -- 6. credit the ledger, but only on approval — reference_id points at the
  --    review row, so the existing one-credit-per-reference unique index
  --    still guarantees at most one payout no matter how this is retried.
  if p_status = 'approved' then
    insert into hour_transactions (user_id, amount, type, reference_id, note)
    values (
      v_owner_id,
      p_approved_hours,
      'checkpoint_approved',
      p_review_id,
      'Hack Club submission approved'
    );
  end if;

  return p_review_id;
end;
$$;

revoke all on function review_hackclub_submission(uuid, uuid, submission_status, numeric, text, text, numeric) from public;
revoke all on function review_hackclub_submission(uuid, uuid, submission_status, numeric, text, text, numeric) from anon;
revoke all on function review_hackclub_submission(uuid, uuid, submission_status, numeric, text, text, numeric) from authenticated;
grant execute on function review_hackclub_submission(uuid, uuid, submission_status, numeric, text, text, numeric) to service_role;
