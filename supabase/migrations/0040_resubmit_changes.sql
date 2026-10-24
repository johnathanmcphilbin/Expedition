-- What a builder says they changed when they resubmit after "needs changes",
-- shown to the reviewer next to the feedback they were given.
alter table submission_queue add column if not exists changes_made text;
