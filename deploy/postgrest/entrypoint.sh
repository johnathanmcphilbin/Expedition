#!/bin/sh
# Map the platform port and the Orchard database binding, then exec PostgREST.
# A request with no JWT must be rejected. db-anon-role stays unset, which makes
# PostgREST 16 return 401 (PGRST302). Do not set it to the database owner.
set -eu

if [ -n "${PORT:-}" ] && [ -z "${PGRST_SERVER_PORT:-}" ]; then
	export PGRST_SERVER_PORT="$PORT"
fi

# "Variables -> Use a resource" injects DATABASE_URL. PostgREST reads PGRST_DB_URI.
if [ -z "${PGRST_DB_URI:-}" ] && [ -n "${DATABASE_URL:-}" ]; then
	export PGRST_DB_URI="$DATABASE_URL"
fi

export PGRST_DB_SCHEMAS="${PGRST_DB_SCHEMAS:-public}"
# Always off. Orchard's in-cluster host (pg-<db>-pooler-rw...:5432) is a
# transaction-mode pooler: prepared statements and LISTEN/NOTIFY do not survive
# it. The same settings are safe on a direct connection. Restart PostgREST
# after DDL instead of relying on NOTIFY pgrst.
export PGRST_DB_PREPARED_STATEMENTS="${PGRST_DB_PREPARED_STATEMENTS:-false}"
export PGRST_DB_CHANNEL_ENABLED="${PGRST_DB_CHANNEL_ENABLED:-false}"
export PGRST_OPENAPI_MODE="${PGRST_OPENAPI_MODE:-follow-privileges}"
export PGRST_JWT_SECRET_IS_BASE64="${PGRST_JWT_SECRET_IS_BASE64:-false}"
export PGRST_SERVER_HOST="${PGRST_SERVER_HOST:-!4}"

if [ -n "${PGRST_DB_ANON_ROLE+x}" ]; then
	echo "Unsetting PGRST_DB_ANON_ROLE so a request without a JWT returns 401." >&2
	unset PGRST_DB_ANON_ROLE
fi

if [ -z "${PGRST_DB_URI:-}" ]; then
	echo "PGRST_DB_URI or DATABASE_URL is required" >&2
	exit 1
fi

if [ -n "${PGRST_JWT_SECRET:-}" ] && [ -n "${POSTGREST_JWT_SECRET:-}" ] && [ "$PGRST_JWT_SECRET" != "$POSTGREST_JWT_SECRET" ]; then
	echo "PGRST_JWT_SECRET and POSTGREST_JWT_SECRET are both set and differ" >&2
	exit 1
fi
if [ -z "${PGRST_JWT_SECRET:-}" ] && [ -n "${POSTGREST_JWT_SECRET:-}" ]; then
	PGRST_JWT_SECRET=$POSTGREST_JWT_SECRET
	export PGRST_JWT_SECRET
fi
if [ -z "${PGRST_JWT_SECRET:-}" ]; then
	# Hex HMAC of the database password. The script prints only the hex.
	PGRST_JWT_SECRET=$(/usr/local/bin/derive-jwt-secret.sh)
	export PGRST_JWT_SECRET
fi
unset POSTGREST_JWT_SECRET

exec postgrest
