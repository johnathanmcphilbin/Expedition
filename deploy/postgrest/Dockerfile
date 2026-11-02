# PostgREST for Hack Club Orchard.
# Orchard builds this image from the repository and injects environment variables.
# Required at runtime:
#   PGRST_DB_URI        postgres://authenticator:PASSWORD@HOST:5432/DB?sslmode=require
#   PGRST_JWT_SECRET    same raw string as the app's POSTGREST_JWT_SECRET (32+ chars, not JSON)
# Optional:
#   PORT                mapped to PGRST_SERVER_PORT when the platform assigns one
#
# The image only serves PostgREST. It does not contain database data.

FROM debian:bookworm-slim

ARG POSTGREST_VERSION=16.5

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates curl xz-utils \
	&& curl -fsSL -o /tmp/postgrest.tar.xz \
		"https://github.com/PostgREST/postgrest/releases/download/v${POSTGREST_VERSION}/postgrest-v${POSTGREST_VERSION}-linux-static-x86-64.tar.xz" \
	&& tar -xJf /tmp/postgrest.tar.xz -C /usr/local/bin \
	&& rm /tmp/postgrest.tar.xz \
	&& apt-get purge -y curl xz-utils \
	&& apt-get autoremove -y \
	&& rm -rf /var/lib/apt/lists/* \
	&& command -v postgrest

COPY entrypoint.sh /entrypoint.sh
RUN chmod 755 /entrypoint.sh

USER nobody
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
