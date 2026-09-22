-- Multiple projects per participant, with progress totalled across all of them.
--
-- Design notes:
--  * Hours remain the append-only ledger from 0001. Nothing here stores a
--    total; both views derive from hour_transactions every time they are read.
--  * "How far around" counts hours EARNED, not the net balance. Spending hours
--    on gear must not un-travel the expedition, so the views deliberately
--    ignore debit rows rather than summing the ledger.

-- ------------------------------------------- one Hackatime project per user --

-- Two Expedition projects mapped to the same Hackatime project would count the
-- same tracked time twice over. The database refuses rather than trusting the
-- form to check.
create unique index projects_one_hackatime_per_user
  on projects (user_id, hackatime_project)
  where hackatime_project is not null;

-- ------------------------------------------------- hours earned per project --

-- Ledger credits are tied to a submission via reference_id; submissions carry
-- the project. That chain is what makes per-project hours derivable without
-- adding a column that could drift out of sync.
create view project_hours as
select
  p.id                as project_id,
  p.user_id           as user_id,
  p.title             as title,
  p.hackatime_project as hackatime_project,
  coalesce(sum(t.amount), 0) as hours_earned,
  count(t.id)                as checkpoints_approved,
  max(t.created_at)          as last_checkpoint_at
from projects p
left join submissions s
  on s.project_id = p.id
left join hour_transactions t
  on t.reference_id = s.id
 and t.type = 'checkpoint_approved'
group by p.id, p.user_id, p.title, p.hackatime_project;

-- --------------------------------------------------------- overall progress --

-- The expedition is 40 hours, with a checkpoint every 5. Both constants live
-- here so the dashboard, the trail and any future reward gate read the same
-- number instead of each hard-coding it.
create view user_expedition_progress as
select
  u.id as user_id,
  coalesce(sum(t.amount), 0) as hours_earned,
  40::numeric                as hours_target,
  -- checkpoints are whole 5-hour blocks, capped at the 8 the journey contains
  least(floor(coalesce(sum(t.amount), 0) / 5), 8)::int as checkpoints_reached,
  8                                                    as checkpoints_total,
  least(round(coalesce(sum(t.amount), 0) / 40 * 100, 1), 100) as percent_complete,
  greatest(40 - coalesce(sum(t.amount), 0), 0)               as hours_remaining,
  coalesce(sum(t.amount), 0) >= 40 as finished
from users u
left join hour_transactions t
  on t.user_id = u.id
 and t.type = 'checkpoint_approved'
group by u.id;
