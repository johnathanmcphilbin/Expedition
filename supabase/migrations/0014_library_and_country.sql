-- 1. The project library: a participant can tick "show this in the library"
--    when they submit. It only appears once the submission is approved and
--    sent to Hack Club; its screenshot is kept for it instead of deleted.
alter table submission_queue add column if not exists library_opt_in boolean not null default false;

-- 2. Where people are from, for admin analytics. Country only: the rest of
--    the address still lives in Hack Club's Airtable alone.
alter table hackclub_submissions add column if not exists country text;
