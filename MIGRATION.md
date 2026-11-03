# Move Expedition off Supabase onto Orchard Postgres

The app keeps its existing `.from()` / `.rpc()` calls. They now go to PostgREST
in front of a plain Postgres 17 database. File bytes move out of Supabase
Storage into `public.files`. After cutover the running app has no Supabase URL
and no Supabase client. Supabase itself is left intact until a separate,
explicitly confirmed decommission, weeks later.

## Guarantees

These are requirements, not suggestions.

1. **The migration never writes to the source.** Dump, verify, storage copy, and
   the read-only role generator open the source database read-only (`BEGIN READ
   ONLY`, checked with `SHOW transaction_read_only`, plus a rejected `CREATE
   TEMP TABLE` probe and a SQL filter in the client). Storage access on the
   source is list and download only. The only script that deletes anything on
   Supabase is `scripts/migrate/decommission-supabase`, and nothing else runs it.
2. **A restore will not touch a non-empty target** unless `--fresh-target` is
   passed. That flag drops schema `public` on the target only. URLs that look
   like the Supabase project (`supabase.co`, `supabase.com`, or the project ref
   `ulmowedmbobncmcriszs`) are refused as restore targets.
3. **The first step, before any cutover, is a full backup that is kept.**
   `backup` writes a `pg_dump` of schema `public` (schema and data, sequences
   included) and a tarball of every object in `checkpoint-images`,
   `submission-screenshots`, and `submission-evidence`, plus SHA-256 checksums.
   Keep that directory outside the database. Take another one immediately before
   the final copy, and a last one inside decommission before anything is deleted.
4. **Verify must print `zero mismatches` before the app is pointed at Orchard.**
   It compares per-table row counts, an md5 of the ordered composite text of
   each row, sequence `last_value` / `is_called`, function and trigger counts,
   and file count, size, and md5. Extension-owned objects (for example
   `pg_stat_statements`) are ignored so Supabase-only extras do not create a
   false mismatch. Any real mismatch exits non-zero.
5. **The write freeze covers the whole final copy.** Set `MAINTENANCE_MODE=1`
   on Vercel, wait for in-flight requests to finish, and do not run the fare
   script or edit rows in the Supabase dashboard. Then take the final backup,
   copy, and verify. No application write should land in Supabase after that
   dump.
6. **Rollback stays possible at every step until decommission.** Supabase is not
   modified. Before the Vercel env switch, unsetting `MAINTENANCE_MODE` puts the
   app back on Supabase. After the switch, putting the old env vars back does
   the same. Writes that happened only on Orchard after the switch are not in
   Supabase; that window should be the smoke test, then the soak. Decommission
   is the first step that makes rollback to Supabase data impossible, which is
   why it re-verifies, re-backups, and proves a scratch restore first.

## What the app does differently

`src/lib/server/db.ts` builds a `@supabase/postgrest-js` `PostgrestClient` and
signs a short-lived HS256 JWT (`role: expedition`) with `POSTGREST_JWT_SECRET`.
That is the PostgREST query builder the old Supabase client used internally, so
the `.from()`, `.rpc()`, embed, upsert, and count calls stay as they are.
`@supabase/supabase-js` is gone. Supabase's own client always calls
`/auth/v1` and `/storage/v1` and prefixes REST with `/rest/v1`, which a bare
PostgREST does not serve.

`POSTGREST_URL` and `POSTGREST_JWT_SECRET` replace `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`. `REFERRAL_SECRET` should be set to the old server
secret at cutover so referral cookies already in browsers still verify; if it
is unset, the JWT secret is used and those cookies stop matching.

Uploads, deletes, and downloads that used Storage now read and write
`public.files` (`bucket`, `path`, `content_type`, `size`, `bytes`, `created_at`).
Paths are unchanged. The browser loads `/files/{bucket}/{path}`. That route
checks the same rules the signed URLs used to imply: shown checkpoints and
library screenshots are public; other checkpoint images are the owner or a
reviewer/admin; other screenshots are reviewers/admins; the legacy
`submission-evidence` bucket is staff only.

`MAINTENANCE_MODE=1` (also `true`, `yes`, `on`) makes every method except GET
and HEAD return 503. Reads and file views keep working.

## Why `expedition` is BYPASSRLS or the owner

Every table has RLS enabled and no policies. A normal role sees nothing.
Supabase's `service_role` bypasses RLS the same way, and bypass does **not**
skip triggers, so `hour_transactions` stays append-only.

`deploy/postgrest/roles.sql` is idempotent:

- If the role running it is a superuser, `expedition` is `BYPASSRLS`. Function
  owners stay as they were, so `SECURITY DEFINER` functions keep running as
  the importing owner.
- If it is not a superuser (a managed user cannot grant `BYPASSRLS`), the file
  makes `expedition` the owner of the app's public tables, views, sequences,
  and functions. Owners bypass RLS. `SECURITY DEFINER` functions then run as
  `expedition`. Extension-owned objects are not reassigned.

`expedition_anon` receives no grants when `roles.sql` is allowed to create it.
The PostgREST image does **not** set `PGRST_DB_ANON_ROLE`. With that variable
unset, PostgREST 16 rejects every request that has no valid JWT with `401`
(`PGRST302`, anonymous access is disabled). Do not set `PGRST_DB_ANON_ROLE` to
the database owner: that user bypasses RLS, so a missing JWT would be a full
read and write. `authenticated` and `service_role` are revoked on schema
`public` when an import created them and this user is allowed to revoke;
otherwise they are left as they are and PostgREST does not use them.

An import may also bring schemas `auth` and `storage`, and extensions
`supabase_vault` and `pg_stat_statements`. The setup SQL does not create those
and does not drop them. PostgREST exposes only `public`
(`PGRST_DB_SCHEMAS=public`).

## Orchard

Project `expedition` in the YSWS org. Database name **`expedition-main`**,
Postgres 17, private to apps in that project. The transaction-mode pooler is:

```
pg-<db>-pooler-rw.ysws-expedition.svc.cluster.local:5432
```

For this database that host is
`pg-expedition-main-pooler-rw.ysws-expedition.svc.cluster.local`. Apps bind it
with **Variables → Use a resource**, which injects `DATABASE_URL`. Public TLS
on the database is optional and is **not** required for the app or for the
migrate job. The laptop does not open a Postgres port.

Two images, both built from this repo:

| Image | Dockerfile | What it is |
| --- | --- | --- |
| PostgREST | `deploy/postgrest/Dockerfile` | The API the Vercel app calls. Public HTTPS. |
| Migrate app | `deploy/migrate/Dockerfile` | An HTTP app. `MIGRATE_COMMAND` runs one step, then `GET /health` and `GET /status` stay up. |

PostgREST's entrypoint maps `DATABASE_URL` to `PGRST_DB_URI` and `PORT` to
`PGRST_SERVER_PORT`. Because the pooler is **transaction mode**, the image
defaults to:

- `PGRST_DB_PREPARED_STATEMENTS=false` (prepared statements do not survive the pooler)
- `PGRST_DB_CHANNEL_ENABLED=false` (`LISTEN`/`NOTIFY` does not either; restart PostgREST after DDL)

The JWT still works: each request is one transaction, and PostgREST `SET ROLE`s
inside it to the JWT `role` claim. On Orchard that claim is the database owner
(`POSTGREST_DB_ROLE`). A request with no JWT is not given a role at all.

`verify` and `copy-storage` use `DATABASE_URL` as the target. They read source
Storage over HTTPS (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: list and
download only). `verify` and `backup` also need `SOURCE_DATABASE_URL`.

Use Supabase's **session** connection for `SOURCE_DATABASE_URL` and for
Import from URL (direct host `db.ulmowedmbobncmcriszs.supabase.co`, port 5432,
or the session pooler). The transaction pooler on port 6543 will not hold the
locks `pg_dump` needs. `verify`'s own queries are plain reads inside `BEGIN
READ ONLY`, so they are fine even if that URL is transaction-pooled; `pg_dump`
is not.

`initial-load` does not use `pg_restore`. It applies the cleaned SQL as one
transaction on `DATABASE_URL`. Orchard's transaction-mode pooler keeps that
server connection until commit, so a separate session endpoint is not required
for this job. If the pooler rejects the transaction (statement timeout, or a
statement that cannot run in a transaction), the job rolls back and the public
schema stays empty. Point `DATABASE_URL` at the optional public TLS endpoint
for that one run, then point PostgREST back at the private pooler.

The older `restore` command still uses `pg_restore` and may need that session
endpoint. Prefer `initial-load` for the first load. Import from URL cannot be
used: it fails on `CREATE EXTENSION supabase_vault`, which Orchard's Postgres 17
does not ship.

## Env vars

**Vercel (the app), after the switch**

`MAINTENANCE_MODE=1` is checked in `src/hooks.server.ts` before the session is
read. `GET` and `HEAD` (pages and `/files/...`) run. `POST`, `PUT`, `PATCH`,
and `DELETE` return `503` and never reach PostgREST.

Set these. An explicit `POSTGREST_JWT_SECRET` is required on Vercel because
that app has no `DATABASE_URL` and cannot derive one.

| Name | Value |
| --- | --- |
| `POSTGREST_URL` | Public HTTPS origin of the PostgREST app. No path. |
| `POSTGREST_JWT_SECRET` | The same explicit secret as PostgREST `PGRST_JWT_SECRET`. 32+ characters, not JSON. |
| `POSTGREST_DB_ROLE` | `u_ysws_expedition_expedition` |
| `REFERRAL_SECRET` | The previous server secret, so referral cookies already in browsers still verify |
| `MAINTENANCE_MODE` | `1` for the freeze. Unset it (or `0`) only after `final-sync: OK` and a PostgREST restart |
| `APP_ORIGIN` | `https://expedition.hackclub.com` |
| `HCA_CLIENT_ID` | Keep the existing Hack Club Auth client id |
| `HCA_CLIENT_SECRET` | Keep the existing Hack Club Auth client secret |
| `HACKATIME_CLIENT_ID` | Keep |
| `HACKATIME_CLIENT_SECRET` | Keep |
| `AIRTABLE_API_KEY` | Keep. Reviews still write Hack Club's Airtable. There is no Slack API token; Slack ids come from Hack Club Auth. |

Optional, keep if they are set today: `HCA_SCOPE`, `HCA_REDIRECT_URI`, `RESEND_API_KEY`, `NOTIFY_EMAIL`, `NOTIFY_FROM`, `PLAUSIBLE_API_KEY`, `PLAUSIBLE_SITE_ID`.

Remove: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and any other `SUPABASE_*` variable. Do not remove them until the deployment that is going out is this branch. The current `main` deployment still needs them.

**PostgREST app on Orchard**

Dockerfile `deploy/postgrest/Dockerfile`, build context the repository root. Do not set a container command. Orchard sets `PORT=3000`.

| Name | Value |
| --- | --- |
| `DATABASE_URL` | **Variables → Use a resource** on the loaded database (`expedition`). Do not paste the pooler URL. |
| `PGRST_JWT_SECRET` | Leave **unset**. The entrypoint derives it as hex HMAC-SHA256, keyed with the `DATABASE_URL` password, over the string `expedition-postgrest-jwt-v1`. The same function runs in the migrate image. Set it only when you also set `POSTGREST_JWT_SECRET` to that exact value (explicit always wins). It is never logged. |
| `POSTGREST_JWT_SECRET` | Leave unset, unless you set `PGRST_JWT_SECRET` to the same value. |
| `PGRST_DB_ANON_ROLE` | **Do not set.** The entrypoint unsets it if it is present. Anonymous requests get `401`. |
| `POSTGREST_DB_ROLE` | Not read by PostgREST. The JWT from the app carries the role. |
| `PGRST_DB_PREPARED_STATEMENTS` | Leave unset. The image sets `false`. Safe on the transaction pooler and on a direct connection. |
| `PGRST_DB_CHANNEL_ENABLED` | Leave unset. The image sets `false`. |
| `PGRST_JWT_SECRET_IS_BASE64` | Leave unset. The image sets `false` (the derived value is hex text, not base64). |
| `PORT` | Set by Orchard (`3000`). Do not override. |

**Migrate job**

| Name | Value |
| --- | --- |
| `DATABASE_URL` | Bound `expedition-main` |
| `SOURCE_DATABASE_URL` | Supabase session connection. Read-only in practice; the scripts force it. |
| `SUPABASE_URL` | `https://ulmowedmbobncmcriszs.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Storage list/download, and decommission later |

Subcommands. Orchard has no command field, so set `MIGRATE_COMMAND` to one of these names. Extra flags go in `MIGRATE_ARGS`. Once an **App command** job step exists, run the same names against this app from that step:

```
initial-load
post-load
verify
copy-storage
backup --out /backups/initial
restore --dump /backups/initial/public.dump --fresh-target
readonly-role --out /backups/control_tower_expedition_ro.sql
roles
manifest-emit --out /backups/manifest.json
manifest-check --manifest /backups/manifest.json
test
final-sync
decommission --confirm-decommission --project-ref ulmowedmbobncmcriszs
```

`roles` applies `deploy/postgrest/roles.sql` with `psql` to `DATABASE_URL`.

## Runbook

### 0. Before anything else

Read the guarantees above. Supabase project `ulmowedmbobncmcriszs` stays. No
production env var changes until step 10. No merge is required for the app to
be ready; this document is the procedure.

### 1. Backup, and keep it

Run the migrate job: `backup --out /backups/initial` (put `/backups` on a
volume you can copy off the pod). It writes `public.dump`, `storage.tar.gz`,
and `SHA256SUMS`. Copy them somewhere that is not Supabase and not
`expedition-main`. This happens before the import and before the freeze. Do
not delete them.

Check `SHA256SUMS` against the files after the copy.

### 2. Load `expedition-main` with the migrate job (`initial-load`)

Orchard **Import from URL** failed on this database. Its `pg_restore` stops on
`CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault` because that
extension is not installed (`supabase_vault.control` is absent). Do not retry
Import from URL.

Create an empty database named `expedition-main` if it is not there yet. Build
an app in the Orchard project `expedition` from this branch:

Orchard's GitHub deploy form has no container command, only the Dockerfile path, an optional stage, and "build from repo root". It sets `PORT=3000` and expects the process to keep serving HTTP. Deploy `deploy/migrate/Dockerfile` as an app (not a Job: Jobs cannot build from this repo). Do not set a Dockerfile `CMD`.

| Setting | Value |
| --- | --- |
| Dockerfile path | `deploy/migrate/Dockerfile` |
| Build from repo root | yes |
| `DATABASE_URL` | **Variables → Use a resource** on empty `expedition-main`. This is the target. |
| `SOURCE_DATABASE_URL` | Secret. Supabase **session** connection, port 5432 (`db.ulmowedmbobncmcriszs.supabase.co` or the session pooler). Not the transaction pooler on 6543. |
| `MIGRATE_COMMAND` | `initial-load` |
| `PORT` | Set by Orchard (`3000`). Do not override. |

The container runs `initial-load` once, writes the full log to its stdout, then stays up. `GET /health` returns 200. `GET /status` is plain text: the command, when it finished, the exit code, and the last 300 log lines with connection strings redacted. A refusal because the target is not empty is exit code 1 **in that page**, and the process does not exit, so Orchard does not restart-loop. A later restart does not run a successful command again. Set `MIGRATE_RERUN=1` to force one more run (for example after a failed first attempt on a still-empty database).

When Orchard's **App command** job step exists, point it at this same app and run the same subcommands (`initial-load`, `verify`, `copy-storage`, `manifest-check`, `roles`, …) that way instead of redeploying with a new `MIGRATE_COMMAND`.

`MIGRATE_ARGS` is an optional extra, split on spaces, for flags such as `--out /tmp/backup` or `--manifest /tmp/manifest.json`.

The job dumps schema `public` only (`--no-owner --no-acl`), in a read-only
session. It keeps `pgcrypto` and `uuid-ossp` if the dump uses them, and drops
`supabase_vault`, `pg_graphql`, `pg_stat_statements`, and any statement aimed
at `auth`, `storage`, `realtime`, `vault`, or `graphql`. Foreign keys and
`auth.uid()` defaults are stripped and logged. Anything that cannot be
rewritten is dropped and listed as `DROP`. The log is the list of what did
not land.

It refuses to run if `public` already has tables, views, sequences, or
functions. A failed load rolls back. Fix the error and run it again on the
still-empty database.

Then it applies `deploy/postgrest/roles.sql` and prints every table's count
and md5 and every sequence's `last_value`. Table data and sequences must
match the source. Function or trigger counts may differ only by the objects
the log says were dropped. Storage files are not in this step.

`public.files` is not on the source. Step 5 copies Storage into it.

### 3. Roles

The Orchard app user `u_ysws_expedition_expedition` owns the database and has neither `CREATEROLE` nor superuser. `roles.sql` detects that and exits 0 with `SKIP roles:`. It creates nothing and grants nothing. PostgREST connects as that user. Set `POSTGREST_DB_ROLE` to `u_ysws_expedition_expedition` on the Vercel app and on the migrate test run so the JWT `role` claim is that login. Do **not** set `PGRST_DB_ANON_ROLE`. With it unset, a request with no JWT is `401`, not the owner. The append-only trigger on `hour_transactions` still rejects UPDATE and DELETE for the owner.

`control_tower_expedition_ro` cannot be created by this user either. `readonly-role` still writes the SQL, and applying it prints a warning and skips. An Orchard admin, or a second user Orchard provides, has to create that read-only role.

After `initial-load`, set `MIGRATE_COMMAND=post-load` (or run an App command of `post-load` once that step exists). It runs `roles.sql` and prints the target's table counts, order-independent md5s, and sequence `last_value`s. It does not open the source and does not reload data. `MIGRATE_COMMAND=verify` compares source and target (read-only on the source) and prints `MATCH` or `MISMATCH` for each shared table, sequence, and for functions, triggers, views, and enums. A table that exists only on the target is `TARGET-ONLY`, not `MATCH`. `public.files` is the expected one. Any other target-only table fails the run.

The 340 restored statements from the live run were committed before `roles.sql` started. Restore is one transaction that commits, then `roles.sql` is a second session. Its permission error did not roll the data back. The rows are in `expedition`. Confirm with `post-load` or `verify`.

Migrate job command `roles`, or from any container that can reach the database:

```
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/postgrest/roles.sql
```

Re-run it after the files table exists; it is idempotent. PostgREST has no no-JWT role: `PGRST_DB_ANON_ROLE` stays unset and those requests return `401`.

### 4. Deploy PostgREST

Build `deploy/postgrest/Dockerfile` as an app in the same Orchard project.
Build context is the repository root. Bind the loaded database (`expedition`)
with **Variables → Use a resource**. Leave `PGRST_JWT_SECRET` and
`PGRST_DB_ANON_ROLE` unset. Give the app a public HTTPS URL. Restart it after
any later DDL (the pooler will not deliver `NOTIFY`).

| Setting | Value |
| --- | --- |
| Dockerfile path | `deploy/postgrest/Dockerfile` |
| Build from repo root | yes |
| `DATABASE_URL` | **Variables → Use a resource** on `expedition` |
| `PGRST_JWT_SECRET` | unset (derived) |
| `PGRST_DB_ANON_ROLE` | unset |
| `PORT` | Set by Orchard (`3000`) |

From any HTTPS client:

```
curl -sS -D - "$POSTGREST_URL/users?select=id&limit=1"
```

That must be `401` and the body must not be a row array. A request with a JWT
signed the same way as `scripts/lib/postgrest.mjs`, `role` =
`u_ysws_expedition_expedition`, returns rows.

### 4b. Run the flow tests on Orchard

Redeploy the migrate app (or set the command and restart) with the test env.
It does not open `SOURCE_DATABASE_URL` or Supabase. It writes only rows tagged
`orchard-test-` through `POSTGREST_URL`, then deletes those rows. Ledger rows
cannot be deleted; a paid test user stays, still tagged `orchard-test-`.
`referral_reconcile()` is not called when it would pay a non-test approval.

| Setting | Value |
| --- | --- |
| Dockerfile path | `deploy/migrate/Dockerfile` |
| Build from repo root | yes |
| `DATABASE_URL` | **Variables → Use a resource** on `expedition` (same binding as PostgREST) |
| `MIGRATE_COMMAND` | `test` |
| `POSTGREST_URL` | Public HTTPS origin of the PostgREST app, no path |
| `POSTGREST_JWT_SECRET` | unset, so it derives the same secret as PostgREST |
| `POSTGREST_DB_ROLE` | unset. The test uses `current_user`, which is the owner. Set `u_ysws_expedition_expedition` if you want it explicit. |
| `SOURCE_DATABASE_URL` | unset for this run |
| `SUPABASE_URL` | unset for this run |
| `SUPABASE_SERVICE_ROLE_KEY` | unset for this run |
| `PORT` | Set by Orchard (`3000`) |

`GET /health` is `200`. `GET /status` shows one `PASS` or `FAIL` line per test, then `tests: N passed, M failed`, then the exit code. A successful run is not repeated unless `MIGRATE_RERUN=1`. Nothing on Supabase is deleted or written.

The suite runs inside the migrate process and loads the server modules (including the airport data used when a submission is queued). Locally that process peaked near 200MB RSS, which is above 128MB. If Orchard kills the pod during `test`, raise that app's memory for this run. The secret and the database password are not written to the log.

### 5. Copy Storage

Migrate job: `copy-storage`. It creates `public.files` if needed and upserts
every distinct object. The last lines look like this:

```
files: rows at start 0, rows at end 110, unique 110, inserted 110, updated 0, already stored 0, concurrent 0, duplicate listings 37
```

`already stored` means the row was there before this process started and its size, sha256, and content_type matched. `concurrent` means it was not there at the start but matched when this process reached it, so another copy-storage wrote it. `duplicate listings` means the storage list returned that path more than once; it is stored once. A first run into an empty table has `already stored 0`. The old `unchanged` counter incremented for a duplicate listing and for a row another pod had just inserted, and it did not record the row count at the start, so a non-zero `unchanged` on an empty table did not say which of those happened.

Re-running it only writes objects whose size, sha256, or content_type changed. Hashing streams. The bytes of one object are buffered only while that object is inserted or updated.

### 6. Verify

Migrate job: `verify`. With `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set it
lists all three buckets (read-only), streams each object to a sha256, and
compares count, size, sha256, and content_type with `public.files`. It prints
`MATCH` or `MISMATCH` for each bucket and for `files total`. Without those
credentials it prints `files: SKIP`. Tables that exist only on the target are
`TARGET-ONLY`. `files` is expected and does not by itself fail the run. Any
other target-only table is named and does. The job must print
`verify: OVERALL MATCH` and exit 0. If it does not, stop. Do not switch the
app over.

### 7. Read-only role for control tower

`readonly-role --out /backups/control_tower_expedition_ro.sql` reads
`information_schema.column_privileges` for `control_tower_expedition_ro` on the
source and writes SQL. Apply that file to the **target** only. If the source
role has no column grants, the script exits non-zero instead of inventing any.

### 8. Explicit JWT, then merge with the freeze already on

Vercel deploys `main` when this branch is merged. Do not merge until the
environment below is saved, and do not remove `SUPABASE_*` until that merge.
Changing only the env on the current `main` deployment must keep `SUPABASE_*`,
because that code still talks to Supabase. `MAINTENANCE_MODE` on the old code
does nothing if that code does not read it.

1. Pick a secret (32+ characters, not JSON). Set `PGRST_JWT_SECRET` on the PostgREST app to that value and restart it. Leave `PGRST_DB_ANON_ROLE` unset. A request with no JWT must stay `401`. The derived fallback is not used while `PGRST_JWT_SECRET` is set.
2. On the migrate app set `POSTGREST_JWT_SECRET` to that same value. Set `POSTGREST_URL` to the in-cluster PostgREST address. Keep `DATABASE_URL` bound to `expedition`. Set `SOURCE_DATABASE_URL` (Supabase session, port 5432), `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Do not set `MIGRATE_COMMAND=final-sync` yet.
3. On Vercel, add the variables in the table above, including `MAINTENANCE_MODE=1` and `POSTGREST_DB_ROLE=u_ysws_expedition_expedition`. Keep `SUPABASE_*` in the Vercel project until the new deployment is the one that is live, so a rollback to `main` still has them.
4. Merge. The production deploy comes up on PostgREST with writes refused (`503` for every method except `GET` and `HEAD`). Wait until that deployment is ready and old instances have drained. Do not edit Supabase. Do not run `npm run fares` against Supabase.

### 9. `final-sync`

Set `MIGRATE_COMMAND=final-sync` on the migrate app and restart it. It is not
re-run on the next restart unless `MIGRATE_RERUN=1`.

It dumps schema `public` read-only with the same flags and filter as
`initial-load`, and keeps the file at `$MIGRATE_STATE_DIR/final-sync/public.sql`.
It does not drop anything if that dump or the filter fails. The replace is one
transaction on `DATABASE_URL` only: terminate other sessions (PostgREST's),
`DROP SCHEMA public CASCADE`, restore the filtered SQL, commit. A statement
error rolls that back, so `public` is not left empty. Then it creates
`public.files`, runs `post-load`, copies storage (list and download only), and
runs `verify`.

`GET /status` must show `final-sync: OK` and `exit_code: 0`. Anything else is
`final-sync: FAILED`. Restart the PostgREST app after a replace, including a
successful one, so it reconnects and reloads the schema.

Supabase is only read. This command refuses a `DATABASE_URL` whose host looks
like Supabase.

### 10. Open writes

Unset `MAINTENANCE_MODE` (or set it to `0`) and redeploy Vercel. Remove
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and any other
`SUPABASE_*` variable on that deploy. Smoke the site. Reads and writes now go
to Orchard.

Rollback before this step: the freeze is still on and Supabase was not
written. Revert the merge so Vercel returns to `main`, which still has
`SUPABASE_*`. Orchard can be abandoned or loaded again. Rollback after this
step is the same revert, but writes that happened only on Orchard after the
freeze was lifted are not in Supabase.

### 11. Smoke test

Signed out: the public log and library load images from `/files/...`.
Signed in: dashboard, a checkpoint image the user owns, a reviewer opening a
queued screenshot. One cheap write (then read it back): a mailing signup or an
admin note, not a ledger edit. Confirm `hour_transactions` still rejects
UPDATE. Confirm a request with no JWT to PostgREST returns `401`.

### 12. After the freeze is off

Step 10 already unsets `MAINTENANCE_MODE`. Watch the next real submission and
the fare refresh (`npm run fares` now needs `POSTGREST_URL` and
`POSTGREST_JWT_SECRET`).

### 13. Soak

Run on Orchard for **one to two weeks**. Keep both backups. Do not decommission.
Supabase is still the rollback: step 10 in reverse. The longer the soak, the
more Orchard-only writes a rollback would leave behind; if you roll back after
real use, those writes need a separate decision. The database on Supabase is
unchanged either way.

### 14. Decommission Supabase data

Only after the soak, and only by a person who means it. This is the first
destructive step. The migrate job command:

```
decommission --confirm-decommission --project-ref ulmowedmbobncmcriszs
```

The image starts a Postgres **inside the container** named
`expedition_decommission_scratch` and sets `SCRATCH_DATABASE_URL` to it. You
can pass your own scratch URL; it must be loopback and that database name.

The script then:

1. Refuses to run without both flags, and refuses a source URL that is not this Supabase project.
2. Re-runs `verify` against live Orchard. Any mismatch aborts. Nothing is deleted.
3. Writes a last backup (`public.dump`, `storage.tar.gz`, checksums).
4. Restores that dump into the scratch database and checks row counts, checksums, sequences, functions, triggers, and the tarball's file hashes against the snapshot. Any mismatch aborts. Nothing is deleted.
5. Writes `DECOMMISSION_AUTHORIZED.json`, then deletes every object in the three buckets, deletes the buckets, and `DROP SCHEMA public CASCADE` on Supabase. It recreates an empty `public`. It does not drop `auth`, `storage`, or extension schemas.

If deletion stops halfway, do not re-run from scratch (verify will no longer match). Resume with the same flags plus `--resume-backup <that directory>`. Resume checks the checksums and the scratch restore, not the half-deleted source.

### 15. Pause or delete the Supabase project

Not automated. After step 14 the project still exists and still bills. Pausing
or deleting it is a dashboard action for the owner. Do that only when the
backups from steps 1, 9, and 14 are stored somewhere else.

## Local development

`scripts/dev/apply-repo-migrations.sh` replays `supabase/migrations` onto a
plain Postgres (it creates empty `anon` / `authenticated` / `service_role`
roles first, because the historical files GRANT to those names, and it skips
Storage bucket inserts when the `storage` schema is absent). Then run
`deploy/postgrest/roles.sql` and start PostgREST. Tests that hit a database
need `RUN_DB_TESTS=1`, `POSTGREST_URL`, and `POSTGREST_JWT_SECRET`.
