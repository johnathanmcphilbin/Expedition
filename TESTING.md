# Testing Expedition on Orchard before cutover

Run this against a **staging** PostgREST pointed at a copy of the data (the
`initial-load` job on `expedition-main`, or a second database loaded the same
way). Do it before the Vercel env switch.

The suite writes only through `POSTGREST_URL`. It refuses to start if that URL
contains `supabase.co`, `supabase.com`, or the project ref
`ulmowedmbobncmcriszs`. It never opens `SOURCE_DATABASE_URL`. Rows it creates
use hackclub ids prefixed `orchard-test-` and display names prefixed
`[orchard-test]`. Cleanup deletes those rows on that database. Ledger rows
cannot be deleted: `hour_transactions` is append-only, so a test user who was
paid keeps that user and those ledger rows, still marked `orchard-test-`.

## App flows

From a machine that can reach the staging PostgREST (or from a one-off pod
with this repo):

```
RUN_ORCHARD_TESTS=1 \
POSTGREST_URL=https://<staging-postgrest> \
POSTGREST_JWT_SECRET=<same secret as PGRST_JWT_SECRET> \
REFERRAL_SECRET=<any staging secret> \
npm test -- tests/orchard-flows.integration.test.ts
```

`POSTGREST_JWT_SECRET` must be at least 32 characters and must not be JSON.
The JWT role is `expedition`, which `deploy/postgrest/roles.sql` created.

The file covers sign-in (`upsertUser` plus session create/read/destroy),
profile update without a role change, project connect/update/disconnect,
daily coding rows, checkpoint image upload and read-back from `public.files`,
a queued submission screenshot, a legacy `submission-evidence` object, review
queue decisions, referrals, admin list queries and `admin_actions`, every
`.rpc()` the app calls (`review_hackclub_submission`, `reopen_review`,
`claim_reward`, `cancel_reward_claim`, `move_travel_hours`, `award_challenge`,
`referral_pay_for_review`, `referral_reconcile`, `referral_reverse`), the
append-only and `updated_at` triggers, the referral-code trigger, the balance
and travel views, enum rejection, and sequence advance.

`npm test` without `RUN_ORCHARD_TESTS=1` skips this file. The unit tests and
`RUN_DB_TESTS=1` referral tests are separate.

If the SvelteKit app is already deployed against the same database, set
`APP_ORIGIN` as well. The suite then fetches the public checkpoint image URL
and checks the bytes.

## Data manifest

Emit from the source once, read-only (the script sets a read-only transaction
and refuses if the server accepts a write):

```
SOURCE_DATABASE_URL='postgres://...' \
node scripts/migrate/manifest.mjs emit --out manifest.json
```

Check the Orchard database against it. This is also read-only. Use the bound
`DATABASE_URL` inside the migrate job (`manifest-emit` / `manifest-check`):

```
DATABASE_URL='postgres://...' \
node scripts/migrate/manifest.mjs check --manifest manifest.json
```

Each table is a row count and an md5 of the per-row md5s sorted, so heap order
does not matter. Sequences are `last_value` and `is_called`. Each file is
`bucket`, `path`, `size`, and `sha256(bytes)`. `public.files` is the file
section, not a table section. Exit code 0 means zero mismatches.

Run `manifest-check` after `initial-load` and `copy-storage`, and again after
the final freeze copy, before changing Vercel. Table md5s will differ from the
source manifest once real Orchard writes exist; emit a fresh manifest from
Orchard at the end of the freeze if you want a checkpoint of that moment.
The pre-cutover check is source manifest versus Orchard immediately after the
load and the storage copy, before the app is switched.

## What this does not do

It does not call Hack Club Auth, Hackatime, or Airtable. Sign-in is the
database half (`upsertUser` and the session cookie). It does not run against
production Supabase, and it does not delete Supabase data.
