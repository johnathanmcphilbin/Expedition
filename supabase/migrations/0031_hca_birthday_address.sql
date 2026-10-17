-- Birthday and mailing address from Hack Club Auth (the birthdate and
-- address scopes, which only HQ-official apps get), saved at sign-in so the
-- submit form can fill them in. Server-only like everything else (RLS on,
-- no policies); never shown to reviewers.
alter table users add column if not exists hca_birthdate date;
alter table users add column if not exists hca_address jsonb; -- { street_address, locality, region, postal_code, country }
