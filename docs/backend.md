# Expedition backend

SvelteKit server routes + Supabase Postgres, reviewing submissions that live
in Hack Club's own Airtable. Identity is **Hack Club Auth**. Supabase Auth is
not used.

## Local setup

### 1. Environment

```bash
cp .env.example .env
```

`.env` is gitignored; never commit real values.

| Variable | Where it comes from |
| --- | --- |
| `SUPABASE_URL` | Supabase → Project Settings → Data API |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page. **Server-only, bypasses RLS.** |
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

Run the migrations in order against your Supabase project (SQL Editor, or
`psql`/`supabase db push`):

```
supabase/migrations/0001_init.sql
supabase/migrations/0002_review_submission.sql
supabase/migrations/0003_project_progress.sql
supabase/migrations/0004_hackclub_submissions.sql
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
Browser ──▶ SvelteKit server (trusted) ──▶ Supabase (service role)
                    │                            ▲
                    ├── auth.hackclub.com         │  cache
                    │       identity              │
                    ├── hackatime.hackclub.com     │
                    │       coding-time evidence   │
                    └── api.airtable.com ──────────┘
                            Hack Club's Unified YSWS —
                            THE submission, read + reviews written back
```

The browser never talks to Supabase or Airtable directly. There is no
client-side key of any kind — all reads and writes go through server load
functions and form actions.

### There is exactly one submission

Hack Club's own **Unified YSWS** Airtable base (`appGcYrt3CFYab05y`, table
`YSWS Project Submission`) is the canonical record of what a participant
submitted. Expedition does not have — and must not grow — a second,
Expedition-specific submission form. `/submit-to-hackclub` embeds that real
Hack Club form, prefilled with the participant's Hackatime ID and chosen
project so the resulting row can be matched back automatically.

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
by `review_hackclub_submission()` on an approval. `reward_claimed` and
`travel_allocation` are debits an admin enters by hand from the roster on
`/admin`, once a spend has been agreed some other way — there is currently no
self-service way for a participant to redeem hours for gear.

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

After a review is saved, the server writes it into a **separate table
Expedition owns** — `Expedition Reviews` (`tblPXbJtyA6i9XjeU`, same base) —
never into Hack Club's own `YSWS Project Submission` fields.
`src/lib/server/airtable.ts::writeReviewToAirtable` upserts by matching on the
`Expedition Review ID` field, so saving the same review twice updates one
Airtable row instead of creating duplicates. `AIRTABLE_API_KEY` is read only
in `src/lib/server/env.ts` and only ever used from server code — it is never
sent to the browser.

If the Airtable write fails, the review and any ledger credit are **already
committed** — the action reports the Airtable failure separately rather than
pretending the whole save failed.

### RLS

Every table has RLS enabled with **zero policies**. The anon and publishable
keys can therefore read and write nothing. Only the service-role key used by
the server (which bypasses RLS) has access. If a publishable key is ever
exposed, it grants nothing — this fails closed.

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
| `/dashboard`, `/your-hours`, `/submit-to-hackclub` | signed in |
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

## Known gaps / next steps

- **Deploy adapter.** Still `@sveltejs/adapter-auto`; pick a concrete adapter
  before deploying.
- **Hackatime token refresh.** Refresh tokens are stored but not yet used; an
  expired connection currently needs reconnecting from the dashboard.
- **Token encryption at rest.** Hackatime tokens rely on Supabase's disk
  encryption plus service-role-only access. Application-level encryption would
  need a key-management decision.
- **Project matching is best-effort.** Hack Club's `Justification - Hackatime
  Project Name(s) + Date Range(s)` field is free text, not a structured
  reference — the dashboard's "submitted" status and the admin panel's
  project suggestion are both substring matches against it, confirmed or
  corrected by a human (the participant implicitly by what they submit, the
  reviewer explicitly by picking from a dropdown). Nothing about *approved*
  hours depends on this matching being right; it only affects display.
- **No self-service reward redemption.** `reward_claimed` and
  `travel_allocation` ledger debits are entered by hand on `/admin` — there is
  no form for a participant to request gear for banked hours yet.
- **Rate limiting.** No throttling on the review-save action or the Airtable
  sync yet.
