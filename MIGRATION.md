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

`expedition_anon` receives no grants. PostgREST uses it for requests with no
JWT (`PGRST_DB_ANON_ROLE`). It is created by this file so it does not depend on
being an admin of an imported Supabase `anon` role. `authenticated` and
`service_role` are revoked on schema `public` when an import created them and
this user is allowed to revoke; otherwise they are left as they are and
PostgREST does not use them.

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
| Migrate job | `deploy/migrate/Dockerfile` | `verify`, `copy-storage`, `backup`, `restore`, `readonly-role`, `roles`, `decommission`. |

PostgREST's entrypoint maps `DATABASE_URL` to `PGRST_DB_URI` and `PORT` to
`PGRST_SERVER_PORT`. Because the pooler is **transaction mode**, the image
defaults to:

- `PGRST_DB_PREPARED_STATEMENTS=false` (prepared statements do not survive the pooler)
- `PGRST_DB_CHANNEL_ENABLED=false` (`LISTEN`/`NOTIFY` does not either; restart PostgREST after DDL)

The JWT still works: each request is one transaction, and PostgREST `SET ROLE`s
inside it. The connection user (the bound `DATABASE_URL` user) is granted
`anon` and `expedition` by `roles.sql`.

`verify` and `copy-storage` use `DATABASE_URL` as the target. They read source
Storage over HTTPS (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: list and
download only). `verify` and `backup` also need `SOURCE_DATABASE_URL`.

Use Supabase's **session** connection for `SOURCE_DATABASE_URL` and for
Import from URL (direct host `db.ulmowedmbobncmcriszs.supabase.co`, port 5432,
or the session pooler). The transaction pooler on port 6543 will not hold the
locks `pg_dump` needs. `verify`'s own queries are plain reads inside `BEGIN
READ ONLY`, so they are fine even if that URL is transaction-pooled; `pg_dump`
is not.

`pg_restore` has the same session requirement. The in-cluster pooler may reject
it. For the final restore during the freeze, if `restore` fails against
`DATABASE_URL`, turn on the database's public TLS endpoint for that window,
point `TARGET_DATABASE_URL` at it, restore, then turn public TLS off again.
PostgREST keeps using the private pooler.

## Env vars

**Vercel (the app), after cutover**

| Name | Value |
| --- | --- |
| `POSTGREST_URL` | Public HTTPS URL of the PostgREST app |
| `POSTGREST_JWT_SECRET` | Same raw 32+ character string as `PGRST_JWT_SECRET`. Not JSON. |
| `REFERRAL_SECRET` | The previous server secret, so existing referral cookies survive |
| `MAINTENANCE_MODE` | `1` only during the freeze |

Remove `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the app. Do not
change production env vars until the runbook says so.

**PostgREST app on Orchard**

| Name | Value |
| --- | --- |
| `DATABASE_URL` | Bound from `expedition-main` (Use a resource). Do not type the pooler URL by hand unless the binding is unavailable. |
| `PGRST_JWT_SECRET` | Same secret as the app |
| Leave the prepared-statement and channel defaults | `false` / `false` |

**Migrate job**

| Name | Value |
| --- | --- |
| `DATABASE_URL` | Bound `expedition-main` |
| `SOURCE_DATABASE_URL` | Supabase session connection. Read-only in practice; the scripts force it. |
| `SUPABASE_URL` | `https://ulmowedmbobncmcriszs.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Storage list/download, and decommission later |

Commands (the container's first argument):

```
verify
copy-storage
backup --out /backups/initial
restore --dump /backups/initial/public.dump --fresh-target
readonly-role --out /backups/control_tower_expedition_ro.sql
roles
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

### 2. Load `expedition-main` with Import from URL

On the Orchard database `expedition-main` (create it if it is not there yet),
use **Import from URL**. Orchard pulls from the Supabase **session** pooler
URL on first boot. That is the bulk load. It may also import `auth`,
`storage`, `supabase_vault`, `pg_stat_statements`, and the roles `anon`,
`authenticated`, and `service_role`. Leave them. The app does not use them.

If the import errors on `supabase_vault` or `pg_stat_statements` because those
extensions are not installed on Orchard, the app does not need them. Fall back
to the migrate job's `restore` of the `public.dump` from step 1 (session
connection to the target; see the pooler note above). `--fresh-target` only if
a partial import left objects in `public`.

`public.files` is not in the source dump. The storage copy creates it.

### 3. Roles

The database user needs to be a superuser (so `expedition` can be `BYPASSRLS`) or have `CREATEROLE` and own schema `public` (so `expedition` can take ownership). Migrate job command `roles`, or from any container that can reach the database:

```
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/postgrest/roles.sql
```

Re-run it after the files table exists; it is idempotent. PostgREST's no-JWT role is `expedition_anon`.

### 4. Deploy PostgREST

Build `deploy/postgrest/Dockerfile` as an app in the same Orchard project.
Bind `expedition-main`. Set `PGRST_JWT_SECRET`. Give the app a public HTTPS
URL. Restart it after any later DDL (the pooler will not deliver `NOTIFY`).

Smoke from a machine that can reach that URL, with a JWT signed the same way
as `scripts/lib/postgrest.mjs` (`role` = `expedition`):

```
curl -s -H "Authorization: Bearer $JWT" "$POSTGREST_URL/users?select=id&limit=1"
```

A request with no JWT must not return rows.

### 5. Copy Storage

Migrate job: `copy-storage`. It creates `public.files` if needed and upserts
every object. Re-running it only writes objects whose size or md5 changed.

### 6. Verify

Migrate job: `verify`. It must print `verify: OK, zero mismatches` and exit 0.
If it does not, stop. Do not switch the app over.

### 7. Read-only role for control tower

`readonly-role --out /backups/control_tower_expedition_ro.sql` reads
`information_schema.column_privileges` for `control_tower_expedition_ro` on the
source and writes SQL. Apply that file to the **target** only. If the source
role has no column grants, the script exits non-zero instead of inventing any.

### 8. Freeze writes

Set `MAINTENANCE_MODE=1` on Vercel. Wait a minute so in-flight POSTs finish.
Do not run `npm run fares` against Supabase. Do not edit data in the Supabase
dashboard. From here until the app points at Orchard, Supabase should receive
no new writes.

Rollback of this step: unset `MAINTENANCE_MODE`. Nothing else has changed.

### 9. Final backup, copy, verify

While the freeze is on:

1. `backup --out /backups/final`. Keep it next to the first backup.
2. Load the delta. Prefer `restore --dump /backups/final/public.dump --fresh-target` over a session connection to `expedition-main`, then `roles` again (grants do not survive `DROP SCHEMA`). If you would rather not drop `public`, do not pass `--fresh-target`; a second restore into a populated database is refused on purpose.
3. `copy-storage` (this is the storage delta; it is idempotent).
4. `roles` once more so `public.files` is granted.
5. Restart PostgREST so it reloads the schema.
6. `verify`. **Zero mismatches, or you do not continue.**

Rollback of this step: the app is still on Supabase. The freeze is still on.
Orchard can be restored again from `backups/final` or abandoned. Supabase was
only read.

### 10. Point Vercel at PostgREST

Set `POSTGREST_URL`, `POSTGREST_JWT_SECRET`, and `REFERRAL_SECRET` (the old
server secret). Remove the Supabase variables. Leave `MAINTENANCE_MODE=1` for
the smoke test if you want production read-only until smoke passes; the smoke
test's writes need it off, so turn it off only after the read-only checks, or
turn it off and smoke immediately.

Rollback: restore the previous Vercel env (`SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`) and remove the PostgREST ones. Supabase still has
the data from the final dump. Writes made only on Orchard after this step are
not in Supabase.

### 11. Smoke test

Signed out: the public log and library load images from `/files/...`.
Signed in: dashboard, a checkpoint image the user owns, a reviewer opening a
queued screenshot. One cheap write (then read it back): a mailing signup or an
admin note, not a ledger edit. Confirm `hour_transactions` still rejects
UPDATE. Confirm a request with no JWT to PostgREST returns nothing.

### 12. Lift the freeze

Unset `MAINTENANCE_MODE`. Watch the next real submission and the fare refresh
(`npm run fares` now needs `POSTGREST_URL` and `POSTGREST_JWT_SECRET`).

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
