# Migration job for the Orchard project `expedition`.
# Build context is the repository root:
#   docker build -f deploy/migrate/Dockerfile .
#
# Orchard's deploy form has no container command. It sets PORT=3000 and env.
# Set MIGRATE_COMMAND (initial-load, verify, copy-storage, test, ...)
# to run that step once; the process then stays up and serves /health and /status.
# Bind expedition-main with Variables -> Use a resource (DATABASE_URL).
# SOURCE_DATABASE_URL is a secret (Supabase session connection) for initial-load,
# verify, and backup.

FROM node:22-bookworm-slim

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates curl gnupg \
	&& install -d /usr/share/postgresql-common/pgdg \
	&& curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
	&& echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
	&& apt-get update \
	&& apt-get install -y --no-install-recommends postgresql-client-17 postgresql-17 \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
# vitest and the SvelteKit server imports are devDependencies. Orchard may set
# NODE_ENV=production during the build; still install them so MIGRATE_COMMAND=test works.
RUN npm ci --include=dev

COPY scripts scripts
COPY src src
COPY tests/orchard-flows.integration.test.ts tests/orchard-flows.integration.test.ts
COPY tests/env-shim.ts tests/env-shim.ts
COPY vitest.config.ts vitest.config.ts
COPY supabase/migrations supabase/migrations
COPY deploy/postgrest/roles.sql deploy/postgrest/roles.sql
COPY deploy/migrate/app.mjs deploy/migrate/app.mjs
COPY deploy/migrate/decommission-prep.sh deploy/migrate/decommission-prep.sh
COPY deploy/migrate/entrypoint.sh /entrypoint.sh
RUN chmod 755 /entrypoint.sh deploy/migrate/decommission-prep.sh

EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
