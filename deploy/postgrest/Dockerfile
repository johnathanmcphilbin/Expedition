# PostgREST for Hack Club Orchard.
# Build context is the repository root:
#   docker build -f deploy/postgrest/Dockerfile .
#
# Runtime:
#   DATABASE_URL        bound with Variables -> Use a resource
#   PGRST_JWT_SECRET    optional. When unset, derived from the DATABASE_URL password.
# Do not set PGRST_DB_ANON_ROLE. Anonymous requests then get 401.
# PORT is mapped to PGRST_SERVER_PORT when the platform assigns one.
#
# The image only serves PostgREST. It does not contain database data.

FROM debian:bookworm-slim

ARG POSTGREST_VERSION=16.5

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates curl xz-utils openssl \
	&& curl -fsSL -o /tmp/postgrest.tar.xz \
		"https://github.com/PostgREST/postgrest/releases/download/v${POSTGREST_VERSION}/postgrest-v${POSTGREST_VERSION}-linux-static-x86-64.tar.xz" \
	&& tar -xJf /tmp/postgrest.tar.xz -C /usr/local/bin \
	&& rm /tmp/postgrest.tar.xz \
	&& apt-get purge -y curl xz-utils \
	&& apt-get autoremove -y \
	&& rm -rf /var/lib/apt/lists/* \
	&& command -v postgrest \
	&& command -v openssl

COPY deploy/postgrest/entrypoint.sh /entrypoint.sh
COPY deploy/postgrest/derive-jwt-secret.sh /usr/local/bin/derive-jwt-secret.sh
RUN chmod 755 /entrypoint.sh /usr/local/bin/derive-jwt-secret.sh

USER nobody
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
