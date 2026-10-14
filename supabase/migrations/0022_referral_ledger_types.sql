-- Referral rewards live in the existing hours ledger under their own types.
-- Postgres won't let a new enum value be used in the transaction that adds
-- it, so this runs on its own before 0023.
alter type hour_transaction_type add value if not exists 'referral_reward';
alter type hour_transaction_type add value if not exists 'referral_reversal';
