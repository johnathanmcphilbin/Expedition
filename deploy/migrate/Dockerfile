# Migration job for the Orchard project `expedition`.
# Build context is the repository root:
#   docker build -f deploy/migrate/Dockerfile .
#
# Bind the expedition-main database (Variables -> Use a resource) so the
# process receives DATABASE_URL. Point the command at verify or copy-storage.
# Source Storage is read over HTTPS (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
# SOURCE_DATABASE_URL is the Supabase session connection, used by verify and
# backup. The laptop does not need a Postgres port open.

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
RUN npm ci

COPY scripts scripts
COPY supabase/migrations supabase/migrations
COPY deploy/postgrest/roles.sql deploy/postgrest/roles.sql
COPY deploy/migrate/entrypoint.sh /entrypoint.sh
RUN chmod 755 /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["verify"]
