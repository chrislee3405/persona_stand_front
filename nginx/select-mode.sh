#!/bin/sh
# Picks plain HTTP or HTTPS each time the container starts.
#
# Installed as /docker-entrypoint.d/15-persona-select-mode.sh. The stock nginx
# entrypoint runs every executable script there, in name order, before it
# starts nginx -- and stops the container if one fails, which is what the
# `exit 1`s below rely on.
#
#   TLS_DOMAIN unset or empty -> nginx/http.conf         (plain HTTP on 8080)
#   TLS_DOMAIN=example.com    -> nginx/https.conf.template, filled in
#                                (HTTPS on 8443, 8080 redirects)
#
# Chosen at START, not at build: the same image is what CI tests over plain
# HTTP, and what EC2 runs over HTTPS. Rebuilding for production would ship an
# image nobody had tested.
set -eu

PERSONA_DIR=/etc/nginx/persona
# Written through `>` (never cp or mv) below: this runs as the non-root nginx
# user, which owns this FILE but not conf.d/, so the file can be rewritten in
# place but not replaced -- and busybox cp tries to replace it.
TARGET=/etc/nginx/conf.d/default.conf
CERT_DIR=/etc/nginx/certs

if [ -z "${TLS_DOMAIN:-}" ]; then
    cat "$PERSONA_DIR/http.conf" > "$TARGET"
    echo "persona: TLS_DOMAIN is not set -- serving plain HTTP on 8080"
    exit 0
fi

# The value is written into the config, so accept a host name and nothing
# else: no scheme, path, port, spaces or quotes.
case "$TLS_DOMAIN" in
    *[!A-Za-z0-9.-]* | .* | *. | *..* | -*)
        echo "persona: TLS_DOMAIN='$TLS_DOMAIN' is not a plain host name (example: www.example.com)" >&2
        exit 1
        ;;
esac

HSTS_MAX_AGE="${HSTS_MAX_AGE:-300}"
case "$HSTS_MAX_AGE" in
    '' | *[!0-9]*)
        echo "persona: HSTS_MAX_AGE='$HSTS_MAX_AGE' must be a whole number of seconds" >&2
        exit 1
        ;;
esac

# Fail rather than fall back to HTTP. A silent fallback would serve the site
# over HTTP while SESSION_COOKIE_SECURE=true -- which looks fine and breaks
# every chat -- or quietly undo HTTPS after a botched renewal. A container
# that refuses to start is noticed.
for file in fullchain.pem privkey.pem; do
    if [ ! -r "$CERT_DIR/$file" ]; then
        echo "persona: TLS_DOMAIN is set but $CERT_DIR/$file is missing or unreadable." >&2
        echo "persona: issue the certificate first (persona_stand_ec2yml Part A, 'HTTPS with Let's Encrypt')," >&2
        echo "persona: or unset TLS_DOMAIN to serve plain HTTP." >&2
        exit 1
    fi
done

export TLS_DOMAIN HSTS_MAX_AGE
envsubst '${TLS_DOMAIN} ${HSTS_MAX_AGE}' < "$PERSONA_DIR/https.conf.template" > "$TARGET"
echo "persona: serving https://$TLS_DOMAIN on 8443 (8080 redirects; HSTS max-age=$HSTS_MAX_AGE)"
