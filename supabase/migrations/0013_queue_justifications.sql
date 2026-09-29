-- A reviewer's edits to Hack Club's "Justification - ..." and
-- "Optional - Override ... Justification" fields, for a submission that
-- hasn't been sent to Hack Club yet. Keyed by the exact Airtable field name;
-- written onto the Airtable row when the submission is approved and sent.

alter table submission_queue add column if not exists justifications jsonb not null default '{}'::jsonb;
