-- How long things actually wait for a reviewer. A submission sent back for
-- changes isn't waiting on reviewers while the builder works on it, so the
-- clock restarts when it's resubmitted: queued_at is when it last entered
-- the queue. Each logged decision keeps how long that round waited.

alter table submission_queue add column if not exists queued_at timestamptz not null default now();

-- existing rows: when they were submitted, or the latest resubmission's date
-- (newest stamp is first in the notes)
update submission_queue
set queued_at = greatest(
  created_at,
  coalesce(
    (substring(internal_notes from '\[Resubmitted after changes (\d{4}-\d{2}-\d{2})\]'))::date::timestamptz,
    created_at
  )
);

alter table review_decisions add column if not exists waited_hours numeric(8, 2);

-- past decisions: from when that round entered the queue
update review_decisions d
set waited_hours = round((extract(epoch from d.decided_at - w.since) / 3600)::numeric, 2)
from (
  select d2.id,
    case
      when q.id is not null and q.queued_at <= d2.decided_at then q.queued_at
      when q.id is not null then q.created_at
      else s.airtable_created_at
    end as since
  from review_decisions d2
  left join submission_queue q
    on (d2.item_kind = 'new' and q.id::text = d2.item_key)
    or (d2.item_kind = 'hc' and q.airtable_record_id = d2.item_key)
  left join hackclub_submissions s on d2.item_kind = 'hc' and s.airtable_record_id = d2.item_key
) w
where w.id = d.id and w.since is not null and d.decided_at >= w.since and d.waited_hours is null;
