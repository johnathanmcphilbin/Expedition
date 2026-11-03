#!/bin/sh
# Orchard's deploy form cannot set a container command. It sets PORT and env.
# This process runs MIGRATE_COMMAND once (if set), then serves HTTP forever.
set -eu
cd /app
exec node /app/deploy/migrate/app.mjs "$@"
