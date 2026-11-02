#!/bin/sh
# Orchard job image for the migration. The database stays private: this
# container reads the target through DATABASE_URL (resource binding) and the
# source Storage API over HTTPS. It does not run decommission unless that
# command is passed explicitly.
set -eu

cmd=${1:-}
if [ -n "$cmd" ]; then
	shift
fi

cd /app

case "$cmd" in
	verify)
		exec node scripts/migrate/verify.mjs "$@"
		;;
	copy-storage)
		exec node scripts/migrate/copy-storage.mjs "$@"
		;;
	backup)
		exec node scripts/migrate/backup-source.mjs "$@"
		;;
	restore)
		exec node scripts/migrate/restore-target.mjs "$@"
		;;
	readonly-role)
		exec node scripts/migrate/readonly-role.mjs "$@"
		;;
	roles)
		db=${DATABASE_URL:?DATABASE_URL is required}
		if [ -n "${AUTHENTICATOR_PASSWORD:-}" ]; then
			exec psql "$db" -v ON_ERROR_STOP=1 -v authenticator_password="$AUTHENTICATOR_PASSWORD" -f deploy/postgrest/roles.sql
		fi
		exec psql "$db" -v ON_ERROR_STOP=1 -f deploy/postgrest/roles.sql
		;;
	decommission)
		# Scratch proof runs in a Postgres that exists only inside this container.
		if [ -z "${SCRATCH_DATABASE_URL:-}" ]; then
			data=/tmp/expedition-scratch-pg
			port=54329
			if [ ! -d "$data" ]; then
				mkdir -p "$data"
				chown postgres:postgres "$data"
				su -s /bin/sh postgres -c "/usr/lib/postgresql/17/bin/initdb -D '$data' --auth-local=trust --auth-host=trust >/tmp/initdb.log"
				printf "\nlisten_addresses = '127.0.0.1'\nport = %s\n" "$port" >> "$data/postgresql.conf"
			fi
			if ! su -s /bin/sh postgres -c "/usr/lib/postgresql/17/bin/pg_ctl -D '$data' status" >/dev/null 2>&1; then
				su -s /bin/sh postgres -c "/usr/lib/postgresql/17/bin/pg_ctl -D '$data' -l /tmp/scratch-pg.log start"
			fi
			for _ in 1 2 3 4 5 6 7 8 9 10; do
				if su -s /bin/sh postgres -c "/usr/lib/postgresql/17/bin/pg_isready -h 127.0.0.1 -p $port" >/dev/null 2>&1; then
					break
				fi
				sleep 0.3
			done
			su -s /bin/sh postgres -c "/usr/lib/postgresql/17/bin/psql -h 127.0.0.1 -p $port -d postgres -v ON_ERROR_STOP=1 -c \"select 1 from pg_database where datname = 'expedition_decommission_scratch'\" -tA" | grep -q 1 \
				|| su -s /bin/sh postgres -c "/usr/lib/postgresql/17/bin/psql -h 127.0.0.1 -p $port -d postgres -v ON_ERROR_STOP=1 -c 'create database expedition_decommission_scratch'"
			export SCRATCH_DATABASE_URL="postgres://postgres@127.0.0.1:${port}/expedition_decommission_scratch"
		fi
		exec node scripts/migrate/decommission-supabase.mjs "$@"
		;;
	*)
		echo "Usage: verify | copy-storage | backup | restore | readonly-role | roles | decommission" >&2
		exit 2
		;;
esac
