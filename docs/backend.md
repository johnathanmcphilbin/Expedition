# Expedition backend

SvelteKit server routes + Supabase Postgres + Supabase Storage.
Identity is **Hack Club Auth**. Supabase Auth is not used.

## Local setup

### 1. Environment

```bash
cp .env.example .env
```

Fill in six values. `.env` is gitignored; never commit real values.

| Variable | Where it comes from |
| --- | --- |
| `SUPABASE_URL` | Supabase → Project Settings → Data API |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page. **Server-only, bypasses RLS.** |
| `HCA_CLIENT_ID` / `HCA_CLIENT_SECRET` | OAuth client on `auth.hackclub.com` |
| `HACKATIME_CLIENT_ID` / `HACKATIME_CLIENT_SECRET` | OAuth client on `hackatime.hackclub.com` |
| `APP_ORIGIN` | Production only: `https://expedition.hackclub.com` |
| `AIRTABLE_API_KEY` | Personal access token, `data.records:read` + `schema.bases:read` on the Unified YSWS base. Not currently read by the running app — see "Hack Club submission" below. |

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
```

### 3. Storage bucket

Create a **private** bucket named `submission-evidence`
(Supabase → Storage → New bucket → Public = off).

Leave it private. Reviewers get short-lived signed URLs generated server-side.

### 4. Make yourself a reviewer

Roles live in the database and are never accepted from a client. Sign in once
so your user row exists, then:

```sql
update users set role = 'admin' where email = 'you@example.com';
```

### 5. Run

```bash
npm install
npm run dev
```

## Architecture

```
Browser ──▶ SvelteKit server (trusted) ──▶ Supabase (service role)
                    │
                    ├── auth.hackclub.com      identity
                    └── hackatime.hackclub.com coding-time evidence
```

The browser never talks to Supabase. There is no client-side Supabase key of
any kind — all reads and writes go through server load functions and form
actions.

### Sessions

Opaque, server-side. The cookie holds a random 256-bit token; only its SHA-256
hash is stored, so a database leak does not yield live sessions. Sessions are
revocable and expire after 30 days. `hooks.server.ts` resolves `locals.user`
once per request, and that is the only source of identity anywhere.

### Roles

`participant` | `reviewer` | `admin`, stored on `users.role`.

Roles are never read from a token, a form field or a query string. `upsertUser`
deliberately omits `role` from both insert and update, so signing in can never
change your own role.

### The hour ledger

There is no mutable `available_hours` column anywhere. Balances are derived:

```sql
select * from user_hour_balances;  -- SUM(hour_transactions.amount) per user
```

`hour_transactions` is **append-only at the database level** — `BEFORE UPDATE`
and `BEFORE DELETE` triggers raise an exception. Not a convention; enforced.

V1 only writes `checkpoint_approved` credits. `reward_claimed` and
`travel_allocation` already exist in the enum with a sign constraint (credits
positive, debits negative), so spending can be added without a migration.

### Many projects, one expedition

A participant runs as many projects as they like. Each may map to one Hackatime
project, enforced by `projects_one_hackatime_per_user` — without it two projects
could claim the same tracked time and count it twice.

### Hack Club submission, separately from Expedition's hours

`/submit-to-hackclub` embeds Hack Club's own **Unified YSWS** Airtable form
(base `appGcYrt3CFYab05y`, table `YSWS Project Submission`) with a project's
repo/demo URL and description prefilled via Airtable's
[form-prefill query params](https://support.airtable.com/docs/prefilling-a-form).
That's a public, unauthenticated embed — it needs no API key.

This is Hack Club's own end-of-program review and reward pipeline, shared
across every YSWS program, not something Expedition built or controls. It is
deliberately **not** wired to Expedition's ledger:

- The table has no field Expedition sets or can reliably match a synced row
  against — `Automation - YSWS Record ID` is assigned by Hack Club's own
  automation after the fact, not by us.
- The closest thing to a status, `Automation - Status`, only reflects whether
  the row was successfully handed off to Hack Club's backend
  (`1–Pending Submission` / `1.5–Processing` / `2–Submitted` /
  `0–Error`), not whether anyone has reviewed or approved it. Crediting hours
  off that would mean crediting unverified self-reported work.

`AIRTABLE_API_KEY` was used once, ad hoc, to inspect this schema — the app
doesn't read it at runtime. To build a real status readback later (e.g. "not
yet submitted" / "submitted" badges, still never touching the ledger), the
Airtable table would need a hidden field Expedition can prefill with the
project id, so a synced row can be matched exactly instead of guessed at by
name or URL.

Progress is **not** stored. Two views in migration 0003 derive it from the
ledger:

| View | Answers |
| --- | --- |
| `project_hours` | hours and checkpoints earned per project |
| `user_expedition_progress` | hours, checkpoints, percent and hours remaining across all projects |

Both count hours **earned**, not the net balance: spending hours on gear must
not un-travel the expedition. The 40-hour target and the 5-hour checkpoint
interval are defined in `user_expedition_progress` so every page reads the same
numbers rather than hard-coding them.

### Approval is atomic and idempotent

`review_submission()` (migration 0002) does all of this in **one transaction**:

1. re-reads the reviewer's role **from the database**
2. `SELECT … FOR UPDATE` on the submission, so concurrent approvals serialise
3. refuses self-review (`v_owner_id = p_reviewer_id`)
4. refuses an already-settled submission
5. inserts the review
6. updates the submission status
7. inserts the ledger credit — only on approval

Double-clicking cannot pay twice, and this is guaranteed by two unique indexes
rather than by application logic:

```
reviews_one_approval_per_submission          unique (submission_id) where decision = 'approved'
hour_transactions_one_credit_per_submission  unique (reference_id)  where type = 'checkpoint_approved'
```

A retry hits one of those, Postgres raises `23505`, and the whole transaction
rolls back. `submitReview()` translates that into "already decided".

### RLS

Every table has RLS enabled with **zero policies**. The anon and publishable
keys can therefore read and write nothing. Only the service-role key used by
the server (which bypasses RLS) has access. If a publishable key is ever
exposed, it grants nothing — this fails closed.

### Uploads

Private bucket, random UUID paths (`{userId}/{uuid}`), MIME allowlist and a
10MB cap, all validated server-side before the file is stored. Binaries never
enter Postgres — only the storage key.

### Hackatime

Evidence only. Nothing in `src/lib/server/hackatime.ts` writes to the ledger. A
reviewer sees the tracked time and decides the number themselves. Tokens live
in `hackatime_connections`, are read only by the server, and are never included
in anything a load function returns — `connectionStatus()` exists specifically
to return connection state without tokens.

## Routes

| Route | Access |
| --- | --- |
| `/auth/login`, `/auth/callback` | public |
| `/auth/logout` | POST only (a GET logout is CSRF-able) |
| `/auth/hackatime`, `/auth/hackatime/callback` | signed in |
| `/dashboard`, `/your-hours` | signed in |
| `/projects/new`, `/projects/[id]`, `/projects/[id]/submit` | owner only (404 otherwise) |
| `/admin/reviews`, `/admin/reviews/[id]` | reviewer/admin (404 otherwise) |

Reviewer routes return **404, not 403**, so their existence isn't confirmed to
participants.

## Known gaps / next steps

- **Deploy adapter.** Still `@sveltejs/adapter-auto`; pick a concrete adapter
  before deploying.
- **Hackatime token refresh.** Refresh tokens are stored but not yet used; an
  expired connection currently needs reconnecting from the dashboard.
- **Token encryption at rest.** Hackatime tokens rely on Supabase's disk
  encryption plus service-role-only access. Application-level encryption would
  need a key-management decision.
- **Rate limiting.** No throttling on submission creation or uploads yet.
