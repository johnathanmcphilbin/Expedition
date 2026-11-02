#!/bin/sh
# Map the platform port and the Orchard database binding, then exec PostgREST.
set -eu

if [ -n "${PORT:-}" ] && [ -z "${PGRST_SERVER_PORT:-}" ]; then
	export PGRST_SERVER_PORT="$PORT"
fi

# "Variables -> Use a resource" injects DATABASE_URL. PostgREST reads PGRST_DB_URI.
if [ -z "${PGRST_DB_URI:-}" ] && [ -n "${DATABASE_URL:-}" ]; then
	export PGRST_DB_URI="$DATABASE_URL"
fi

export PGRST_DB_SCHEMAS="${PGRST_DB_SCHEMAS:-public}"
export PGRST_DB_ANON_ROLE="${PGRST_DB_ANON_ROLE:-expedition_anon}"
# The in-cluster pooler (pg-<db>-pooler-rw....:5432) is transaction mode.
# Prepared statements and LISTEN/NOTIFY do not survive that. Restart PostgREST
# after DDL instead of relying on NOTIFY pgrst.
export PGRST_DB_PREPARED_STATEMENTS="${PGRST_DB_PREPARED_STATEMENTS:-false}"
export PGRST_DB_CHANNEL_ENABLED="${PGRST_DB_CHANNEL_ENABLED:-false}"
export PGRST_OPENAPI_MODE="${PGRST_OPENAPI_MODE:-follow-privileges}"
export PGRST_JWT_SECRET_IS_BASE64="${PGRST_JWT_SECRET_IS_BASE64:-false}"
export PGRST_SERVER_HOST="${PGRST_SERVER_HOST:-!4}"

if [ -z "${PGRST_DB_URI:-}" ]; then
	echo "PGRST_DB_URI or DATABASE_URL is required" >&2
	exit 1
fi
if [ -z "${PGRST_JWT_SECRET:-}" ]; then
	echo "PGRST_JWT_SECRET is required" >&2
	exit 1
fi

exec postgrest
