#!/bin/sh
# Replay supabase/migrations against a plain Postgres database.
# Usage: scripts/dev/apply-repo-migrations.sh "$DATABASE_URL"
set -eu
db=${1:?database url}
root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
psql "$db" -v ON_ERROR_STOP=1 -f "$root/scripts/dev/prepare-plain-postgres.sql"
for f in "$root"/supabase/migrations/*.sql; do
  echo "apply $(basename "$f")"
  psql "$db" -v ON_ERROR_STOP=1 -f "$f"
done
