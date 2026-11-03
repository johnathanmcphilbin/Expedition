#!/bin/sh
# Print the derived PostgREST JWT secret (lowercase hex) and nothing else.
# HMAC-SHA256, key = the DATABASE_URL password, message = expedition-postgrest-jwt-v1.
# Matches scripts/lib/postgrest.mjs deriveJwtSecret. Never prints the password or the URL.
set -eu

url="${DATABASE_URL:-${PGRST_DB_URI:-}}"
if [ -z "$url" ]; then
	echo "DATABASE_URL is required to derive the JWT secret" >&2
	exit 1
fi
case "$url" in
	postgres://*|postgresql://*) ;;
	*)
		echo "DATABASE_URL must start with postgres:// or postgresql:// to derive the JWT secret" >&2
		exit 1
		;;
esac

rest=${url#*://}
case "$rest" in
	*@*) userinfo=${rest%@*} ;;
	*)
		echo "DATABASE_URL has no user info, so the JWT secret cannot be derived" >&2
		exit 1
		;;
esac
case "$userinfo" in
	*:*) encoded=${userinfo#*:} ;;
	*)
		echo "DATABASE_URL has no password, so the JWT secret cannot be derived" >&2
		exit 1
		;;
esac
if [ -z "$encoded" ]; then
	echo "DATABASE_URL has no password, so the JWT secret cannot be derived" >&2
	exit 1
fi

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
: > "$tmp"
rest=$encoded
while [ -n "$rest" ]; do
	first=${rest%"${rest#?}"}
	if [ "$first" = "%" ]; then
		hex=${rest#?}
		pair=${hex%"${hex#??}"}
		if [ "${#pair}" -ne 2 ]; then
			echo "DATABASE_URL password is not valid percent-encoding" >&2
			exit 1
		fi
		printf '%s' "$pair" | grep -Eq '^[0-9A-Fa-f][0-9A-Fa-f]$' || {
			echo "DATABASE_URL password is not valid percent-encoding" >&2
			exit 1
		}
		oct=$(printf '%03o' "0x$pair")
		printf '%b' "\\$oct" >> "$tmp"
		rest=${rest#???}
	else
		printf '%s' "$first" >> "$tmp"
		rest=${rest#?}
	fi
done

hexkey=$(od -An -tx1 "$tmp" | tr -d ' \n')
if [ -z "$hexkey" ]; then
	echo "DATABASE_URL has no password, so the JWT secret cannot be derived" >&2
	exit 1
fi
hash=$(printf '%s' 'expedition-postgrest-jwt-v1' | openssl dgst -sha256 -mac HMAC -macopt "hexkey:${hexkey}" 2>/dev/null | awk '{print $NF}')
printf '%s' "$hash" | grep -Eq '^[0-9a-f]{64}$' || {
	echo "could not derive the JWT secret" >&2
	exit 1
}
printf '%s' "$hash"
