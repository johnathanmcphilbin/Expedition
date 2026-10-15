-- Reviewers are paid either in Expedition hours (credited to their account)
-- or in cash by an organiser. Cash reviews are recorded as owed until marked
-- paid, and never credit hours.
alter table users add column if not exists review_pay text not null default 'hours'
  check (review_pay in ('hours', 'cash'));

alter table review_payouts add column if not exists paid_as text not null default 'hours'
  check (paid_as in ('hours', 'cash'));
alter table review_payouts add column if not exists cash_paid_at timestamptz;
