-- Referral credit now counts towards the Expedition: the 40h journey, its
-- checkpoints and qualifying for Galway all read this view. Reversed
-- referral rewards come back off. The program budget (approved build hours
-- only, in the admin referrals report) is unaffected.
create or replace view user_expedition_progress with (security_invoker = true) as
select
  u.id as user_id,
  coalesce(sum(t.amount), 0) as hours_earned,
  40::numeric                as hours_target,
  least(floor(coalesce(sum(t.amount), 0) / 5), 8)::int as checkpoints_reached,
  8                                                    as checkpoints_total,
  least(round(coalesce(sum(t.amount), 0) / 40 * 100, 1), 100) as percent_complete,
  greatest(40 - coalesce(sum(t.amount), 0), 0)               as hours_remaining,
  coalesce(sum(t.amount), 0) >= 40 as finished
from users u
left join hour_transactions t
  on t.user_id = u.id
 and t.type in ('checkpoint_approved', 'referral_reward', 'referral_reversal')
group by u.id;

revoke all on user_expedition_progress from anon, authenticated;
