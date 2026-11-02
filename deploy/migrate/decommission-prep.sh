#!/bin/sh
# Started only when MIGRATE_COMMAND=decommission. Prepares a localhost scratch
# database, then runs the decommission script. The parent app keeps serving
# /status even if this exits non-zero.
set -eu
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
	i=0
	while [ "$i" -lt 20 ]; do
		if su -s /bin/sh postgres -c "/usr/lib/postgresql/17/bin/pg_isready -h 127.0.0.1 -p $port" >/dev/null 2>&1; then
			break
		fi
		i=$((i + 1))
		sleep 0.3
	done
	su -s /bin/sh postgres -c "/usr/lib/postgresql/17/bin/psql -h 127.0.0.1 -p $port -d postgres -v ON_ERROR_STOP=1 -tAc \"select 1 from pg_database where datname = 'expedition_decommission_scratch'\"" | grep -q 1 \
		|| su -s /bin/sh postgres -c "/usr/lib/postgresql/17/bin/psql -h 127.0.0.1 -p $port -d postgres -v ON_ERROR_STOP=1 -c 'create database expedition_decommission_scratch'"
	export SCRATCH_DATABASE_URL="postgres://postgres@127.0.0.1:${port}/expedition_decommission_scratch"
fi
exec node scripts/migrate/decommission-supabase.mjs "$@"
