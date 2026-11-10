# Expedition backend

SvelteKit server routes + Postgres, reached through PostgREST. Submissions
that matter live in Hack Club's own Airtable. Identity is **Hack Club Auth**.
There is no Supabase Auth, and after cutover the app does not talk to Supabase
at all. Moving the existing database is described in `MIGRATION.md`.

## Local setup

### 1. Environment

```bash
cp .env.example .env
```

`.env` is gitignored; never commit real values.

| Variable | Where it comes from |
| --- | --- |
| `POSTGREST_URL` | Base URL of the PostgREST app. **Server-only.** |
| `POSTGREST_JWT_SECRET` | Same raw secret as PostgREST `PGRST_JWT_SECRET`. **Server-only.** The app signs a JWT with role `POSTGREST_DB_ROLE` (default `expedition`). On Orchard this may be derived from the database password instead of pasted; see `MIGRATION.md`. |
| `REFERRAL_SECRET` | Optional. Signs the referral cookie. Set to the previous server secret at cutover so existing cookies keep working. |
| `MAINTENANCE_MODE` | Optional. `1` freezes writes (non-GET/HEAD return 503) for the cutover. |
| `HCA_CLIENT_ID` / `HCA_CLIENT_SECRET` | OAuth client on `auth.hackclub.com` |
| `HACKATIME_CLIENT_ID` / `HACKATIME_CLIENT_SECRET` | OAuth client on `hackatime.hackclub.com` |
| `AIRTABLE_API_KEY` | Personal access token on base `appGcYrt3CFYab05y` — `data.records:read`, `data.records:write`, `schema.bases:read`. Create at [airtable.com/create/tokens](https://airtable.com/create/tokens). |
| `APP_ORIGIN` | Production only: `https://expedition.hackclub.com` |

Redirect URIs to register. Both environments can be registered on the same
OAuth client — Doorkeeper takes one URI per line:

```
production
https://expedition.hackclub.com/auth/callback              (Hack Club Auth)
https://expedition.hackclub.com/auth/hackatime/callback    (Hackatime)

development
http://localhost:5175/auth/callback                        (Hack Club Auth)
http://localhost:5175/auth/hackatime/callback              (Hackatime)
```

The `redirect_uri` we send is built from `APP_ORIGIN` when it is set, and from
the request origin otherwise. Set `APP_ORIGIN` in production: behind a
TLS-terminating proxy the request origin can arrive as `http://` or as an
internal hostname, and OAuth providers reject anything that is not a
byte-for-byte match. The dev port is pinned to 5175 in `vite.config.ts` for the
same reason — a drifting port silently breaks the registered URI.

Hackatime scopes: `profile read`. **Never request `admin`.**

### 2. Database

For a local Postgres, replay the migrations (they skip Supabase Storage when
that schema is absent) and then apply `deploy/postgrest/roles.sql`. Point
PostgREST at the database and set `POSTGREST_URL` / `POSTGREST_JWT_SECRET`.
The production cutover does **not** replay these files; it imports the live
database. See `MIGRATION.md`.

```
scripts/dev/apply-repo-migrations.sh "$DATABASE_URL"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/postgrest/roles.sql
```

The migration files, in order, are:

```
supabase/migrations/0001_init.sql
supabase/migrations/0002_review_submission.sql
supabase/migrations/0003_project_progress.sql
supabase/migrations/0004_hackclub_submissions.sql
supabase/migrations/0005_mailing_signups.sql
supabase/migrations/0006_reward_claims.sql
```

0004 drops the tables 0002/0003 built the old submission system on top of
(`projects`, `submissions`, `attachments`, `reviews`) — see "History" below
before running it on a database that has real rows in those tables.

### 3. Make yourself an admin

Roles live in the database and are never accepted from a client. Sign in once
so your user row exists, then:

```sql
update users set role = 'admin' where email = 'you@example.com';
```

Only `admin` can see `/admin` or `/admin/reviews` — there is no separate
`reviewer` role wired to anything in the app (the enum value still exists in
the schema, unused, in case that changes).

### 4. Run

```bash
npm install
npm run dev
```

## Architecture

```
Browser ──▶ SvelteKit server (trusted) ──▶ PostgREST ──▶ Postgres
                    │                         (JWT role expedition)
                    ├── auth.hackclub.com
                    │       identity
                    ├── hackatime.hackclub.com
                    │       coding-time evidence
                    └── api.airtable.com
                            Hack Club's Unified YSWS —
                            THE submission, read + reviews written back
```

The browser never talks to PostgREST or Airtable directly. There is no
client-side key of any kind — all reads and writes go through server load
functions and form actions. File bytes live in `public.files` and are streamed
from `/files/...` after the same access check the old signed URLs implied.

### There is exactly one submission

Hack Club's own **Unified YSWS** Airtable base (`appGcYrt3CFYab05y`, table
`YSWS Project Submission`) is the canonical record of what a participant
submitted. Expedition does not have — and must not grow — a second,
Expedition-specific submission record. `/submit-to-hackclub` is Expedition's
own form, with the Hackatime ID and project set on the server.

There is one holding step before that row exists. A new submission waits in
`submission_queue` (see `src/lib/server/queue.ts` and migration 0010) until
an Expedition reviewer on `/admin/reviews` (the one review page, shared with already-sent submissions) edits and approves it.
Approving creates the one real row in Hack Club's table (`createSubmission`),
caches it in `hackclub_submissions`, credits the hours through
`review_hackclub_submission()`, then clears the address, birthday and
screenshot from Expedition's copy. Needs-changes and rejected submissions
never reach Hack Club.

Expedition's own tables only **cache** and **review** that submission:

- **`hackclub_submissions`** — a local copy of relevant Airtable rows,
  refreshed live (`src/lib/server/airtable.ts::syncHackClubSubmissions`)
  whenever a participant's dashboard or the admin queue loads. A row missing
  from this cache means *not synced yet*, never *not submitted* — the code
  always re-syncs rather than trusting an empty cache as an answer.
- **`submission_reviews`** — Expedition's own opinion: which Hackatime project
  a submission is for, how many of its tracked hours are approved, and the
  review's status/notes/feedback. This is the *only* thing that makes hours
  spendable.

Nothing about "has this been submitted" is ever decided by an Expedition
database row on its own — only by what's synced from Airtable.

### Roles

`participant` | `reviewer` | `admin`, stored on `users.role`. Roles are never
read from a token, a form field or a query string. `upsertUser` deliberately
omits `role` from both insert and update, so signing in can never change your
own role.

### The hour ledger

There is no mutable `available_hours` column anywhere. Balances are derived:

```sql
select * from user_hour_balances;  -- SUM(hour_transactions.amount) per user
```

`hour_transactions` is **append-only at the database level** — `BEFORE UPDATE`
and `BEFORE DELETE` triggers raise an exception, including on a cascaded
delete. Not a convention; enforced. This also means a wrong credit can never
be deleted, only offset with an equal and opposite `manual_adjustment` from
`/admin`.

`checkpoint_approved` is the only credit type produced automatically, and only
by `review_hackclub_submission()` on an approval. `reward_claimed` debits are
written by `claim_reward()` when a participant spends hours on `/claim`.
`travel_allocation` rows are written by `move_travel_hours()` when a
participant banks hours for Dublin (or moves them back) on their dashboard.
One-off corrections are entered by an admin from the roster on `/admin`.

### Spending hours

`/claim` shows the catalogue from `src/lib/data.ts` (the same eight drops the
public rewards page shows) priced in hours. Claiming runs `claim_reward()`,
which — in one transaction — locks the user row, recomputes their balance
from the ledger, refuses if they can't afford it, then writes the claim and
its debit together. Two tabs cannot overdraw a balance, because the check and
the debit are never separated.

Price and name are always read from the catalogue **server-side**; the form
only submits which tier was picked, so a tampered request cannot invent a
cheaper price.

Cancelling a claim (`/admin` → "Cancel & refund") cannot delete the original
debit — the ledger is append-only — so `cancel_reward_claim()` writes a
compensating credit instead. The history stays honest: the spend happened,
then it was refunded.

### Tracked, submitted, approved — not the same number

Three different figures appear across the app, and they're kept visually and
functionally distinct on purpose (see `/dashboard`):

| Term | Comes from | Meaning |
| --- | --- | --- |
| **Tracked** | Hackatime, live | Time logged in the editor. Anyone can see this the moment they connect Hackatime — it proves nothing on its own. |
| **Submitted** | `hackclub_submissions` (cached from Airtable) | A Hack Club submission exists that seems to name this project — a best-effort match against Hack Club's free-text field, shown as a status only. |
| **Approved** | `submission_reviews.approved_hours`, credited via `hour_transactions` | What an Expedition reviewer actually accepted after looking at the submission. |

**Only approved hours ever become spendable balance.** Raw Hackatime time is
never awarded directly — someone can track 100 hours and have 0 approved if
nothing's been submitted and reviewed yet.

### Reviewing is atomic and idempotent

`review_hackclub_submission()` (migration 0004) does all of this in **one
transaction**:

1. re-reads the reviewer's role **from the database** — admin only
2. `SELECT … FOR UPDATE` on the review row, so concurrent decisions serialise
3. refuses self-review (`v_owner_id = p_reviewer_id`)
4. refuses an already-settled review (`approved`/`rejected` are terminal;
   `changes_requested` is not — a reviewer can come back to it)
5. writes the decision, notes and feedback
6. inserts the ledger credit — only on approval

Double-clicking cannot pay twice, guaranteed by unique indexes rather than
application logic:

```
submission_reviews_one_per_project           unique (airtable_record_id, hackatime_project)
hour_transactions_one_credit_per_submission   unique (reference_id) where type = 'checkpoint_approved'
```

A retry hits one of those, Postgres raises `23505`, and the whole transaction
rolls back. `submitReview()` translates that into "already decided".

Saving without a final decision (the "Save Review" button, status left as
`pending`) is the same function call with `p_status = 'pending'` — it updates
notes/hours as a draft without touching the ledger, so a reviewer can jot
things down before deciding.

### Writing back to Airtable

After a review is saved, the server fills the answer **directly onto Hack
Club's own submission row** — an ordinary `PATCH` by record id against
`YSWS Project Submission`, into fields Expedition added to that table:

```
Expedition Hackatime Project        the project this review is scoped to
Expedition Approved Hours           the reviewer's number
Expedition Review Status            Pending / Approved / Needs Changes / Rejected
Expedition Reviewer Notes           internal
Expedition Feedback to Participant  shown to them
Expedition Reviewer
Expedition Reviewed At
```

That's where this org already looks for an answer, so the review goes there
rather than into a table of Expedition's own. Hack Club's own fields are
never touched — only the `Expedition …` ones.

`AIRTABLE_API_KEY` is read only in `src/lib/server/env.ts` and only ever used
from server code — it is never sent to the browser.

(An earlier `Expedition Reviews` table, `tblPXbJtyA6i9XjeU`, was created for
this and is now unused. Airtable's API cannot delete a table, so it is left
in place — delete it by hand if you want it gone.)

If the Airtable write fails, the review and any ledger credit are **already
committed** — the action reports the Airtable failure separately rather than
pretending the whole save failed.

### RLS

Every table has RLS enabled with **zero policies**. PostgREST is started with
`PGRST_DB_ANON_ROLE` unset, so a request with no JWT is rejected with 401
before it reaches the database. The app's JWT switches to `expedition` (or,
on Orchard, the database owner), which bypasses RLS when that role can
(`BYPASSRLS` on a superuser-run setup, otherwise ownership of the public
objects). The append-only trigger on `hour_transactions` still fires for that
role. See `deploy/postgrest/roles.sql` and `MIGRATION.md`.

### Hackatime

Evidence only. Nothing in `src/lib/server/hackatime.ts` writes to the ledger.
`fetchProjectTimes` calls `/authenticated/projects`, scoped to the
participant's own OAuth token. Tokens live in `hackatime_connections`, are
read only by the server, and are never included in anything a load function
returns — `connectionStatus()` exists specifically to return connection state
without tokens.

## Routes

| Route | Access |
| --- | --- |
| `/auth/login`, `/auth/callback` | public |
| `/auth/logout` | POST only (a GET logout is CSRF-able) |
| `/auth/hackatime`, `/auth/hackatime/callback` | signed in |
| `/onboarding` | signed in, connect Hackatime — skipped automatically once connected |
| `/dashboard`, `/your-hours`, `/submit-to-hackclub`, `/claim` | signed in |
| `/admin`, `/admin/reviews` | admin only (404 otherwise) |

Admin routes return **404, not 403**, so their existence isn't confirmed to
participants.

## History: the duplicate submission system this replaced

Earlier versions of Expedition had participants create a project row in this
app (`/projects/new`), then submit a "checkpoint" through a second,
Expedition-only form (`/projects/[id]/submit`) with its own evidence upload,
reviewed through `/admin/reviews/[id]` and credited via `review_submission()`.

That was a duplicate of Hack Club's real Unified YSWS submission, which every
participant has to go through anyway. Migration 0004 removed it entirely —
`projects`, `submissions`, `attachments`, `reviews`, `review_submission()` and
the Supabase Storage evidence bucket are all gone, replaced by the
cache-and-review model described above. Nothing of real value was lost: at
the time of the migration those tables held either nothing or leftover rows
from onboarding UI that no longer exists — no real submission or review had
ever been recorded through them.

## Irish student sign-ups

`/ireland` is only the Irish student sign-up. The Galway event page is
`/galway`. They do not link to each other. `/admin/ireland` lists the sign-ups. The tables are added by
`supabase/migrations/0047_ireland_signups.sql` (new tables only). Apply that
file to the Orchard database. Do not replay the whole migration history onto
production.

Sign-ups are **closed** until an admin opens them on `/admin/ireland`, or
`IRELAND_SIGNUPS_OPEN` is `1` / `true` / `yes` / `on`. `0` / `false` / `no` /
`off` forces them closed even if the admin switch is on. Capacity defaults to
30 (`IRELAND_CAPACITY` overrides the number saved in the admin). That number
is only shown on `/admin/ireland`. The public pages say places are limited,
or that they are full, and never a count. Approved and pending sign-ups hold
a spot. Past that, new sign-ups are marked waitlist. Approving past the
number of approved spots needs the override checkbox on that row.

Approved people go to Attend as a CSV from `/admin/ireland/export`. The columns
Attend's importer reads are `Email`, `First Name`, `Last Name`, `Country` and
`State` (the county). Import that file on the Expedition event. The other
columns are extra and Attend ignores them.

Attend also documents `POST /api/v1/events/{event_id}/participants` (an event
or series API key). That call is off unless both `ATTEND_API_TOKEN` and
`ATTEND_EVENT_ID` are set. When they are, approving someone invites them.
Rejecting them here does not remove them from Attend.

## Known gaps / next steps

- **Deploy adapter.** Still `@sveltejs/adapter-auto`; pick a concrete adapter
  before deploying.
- **Hackatime token refresh.** Refresh tokens are stored but not yet used; an
  expired connection currently needs reconnecting from the dashboard.
- **Token encryption at rest.** Hackatime tokens rely on disk encryption plus
  the server-only database role. Application-level encryption would need a
  key-management decision.
- **Project matching is best-effort.** Hack Club's `Justification - Hackatime
  Project Name(s) + Date Range(s)` field is free text, not a structured
  reference — the dashboard's "submitted" status and the admin panel's
  project suggestion are both substring matches against it, confirmed or
  corrected by a human (the participant implicitly by what they submit, the
  reviewer explicitly by picking from a dropdown). Nothing about *approved*
  hours depends on this matching being right; it only affects display.
- **Reward fulfilment is manual.** Claiming debits the ledger immediately and
  records the request; actually posting the gear is off-platform, tracked by
  the "Mark sent" action on `/admin`.
- **Rate limiting.** No throttling on the review-save action or the Airtable
  sync yet.
