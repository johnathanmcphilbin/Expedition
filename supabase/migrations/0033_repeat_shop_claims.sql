-- Shop items can be bought more than once: each claim is its own spend,
-- still behind claim_reward()'s affordability check under the user lock.
drop index if exists reward_claims_one_live_per_tier;
