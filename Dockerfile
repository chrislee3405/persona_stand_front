# --- Stage 1: Build ---
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# VITE_CDN_BASE is the ONE source for the CDN host, and it has to reach three
# places that cannot check each other:
#   1. the JS bundle        -- src/lib/assetUrl.ts, inlined by Vite
#   2. index.html           -- %VITE_CDN_BASE%, substituted by Vite
#   3. nginx's CSP          -- img-src / media-src, substituted right here
#                              (nginx.conf, installed as persona/site.conf)
#
# It is read from a frontend `.env` file in the build context:
#   - local build    -> your gitignored .env on disk (COPY brings it in)
#   - GitHub Actions -> the workflow writes .env from the repo Variable
#     before `docker build`, and fails if the Variable is unset
# .env is gitignored, so it never reaches GitHub; only .env.local /
# .env.*.local are dockerignored.
#
# The `:?` below fails the build outright when it is missing, BEFORE npm run
# build, rather than producing an image whose page images happen to work
# (assetUrl.ts used to carry a hardcoded fallback) while its favicon, og:image
# and hero preloads contain the literal text `%VITE_CDN_BASE%`. vite.config.ts
# throws on the same condition, so `npm run build` fails on its own too.
#
# The nginx files are collected into /app/nginx-built/ with Windows line
# endings stripped: a checkout with core.autocrlf turns select-mode.sh's
# first line into `#!/bin/sh\r`, which does not run, and nginx would take
# the \r as part of each directive's last argument.
RUN set -eu; \
    if [ -f .env ]; then . ./.env; fi; \
    : "${VITE_CDN_BASE:?VITE_CDN_BASE is required -- set it in persona_stand_front/.env, or as the VITE_CDN_BASE repository Variable in CI}"; \
    CDN_BASE="${VITE_CDN_BASE%/}"; \
    mkdir -p /app/nginx-built; \
    cp nginx/common.conf nginx/http.conf nginx/https.conf.template nginx/select-mode.sh /app/nginx-built/; \
    sed "s|__CDN_BASE__|${CDN_BASE}|g" nginx.conf > /app/nginx-built/site.conf; \
    sed -i 's/\r$//' /app/nginx-built/*; \
    if grep -q '__CDN_BASE__' /app/nginx-built/site.conf; then echo "nginx.conf still contains __CDN_BASE__"; exit 1; fi; \
    echo "CSP media origin: ${CDN_BASE}"

RUN npm run build

# --- Stage 2: HTTPS configuration check ---
# The HTTPS mode is otherwise first exercised on EC2, with a real
# certificate. This stage renders it exactly as select-mode.sh does at start,
# against a throwaway self-signed certificate, and runs `nginx -t` -- so a
# broken template fails the BUILD instead of the production restart. Nothing
# from here ships except an empty marker file, which is what makes the final
# stage depend on (and BuildKit therefore run) this one.
FROM nginx:alpine AS https-check
COPY --from=builder /app/nginx-built/common.conf /etc/nginx/conf.d/00-common.conf
COPY --from=builder /app/nginx-built/ /etc/nginx/persona/
RUN set -eu; \
    apk add --no-cache openssl >/dev/null; \
    mkdir -p /etc/nginx/certs; \
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 -subj "/CN=build-check.invalid" \
        -keyout /etc/nginx/certs/privkey.pem -out /etc/nginx/certs/fullchain.pem 2>/dev/null; \
    TLS_DOMAIN=build-check.invalid sh /etc/nginx/persona/select-mode.sh; \
    nginx -t; \
    touch /https-config-ok

# --- Stage 3: Production ---

# --- Stage 2: Production ---
# Stock nginx:alpine, run as the non-root `nginx` user (uid 101).
#
# Not nginxinc/nginx-unprivileged, which is the usual shortcut for this: its
# blobs would not download here (every tag failed mid-transfer against Docker
# Hub's CDN), and a base image that cannot be fetched is not a dependency
# worth having for four lines of configuration. This also keeps the image
# count down -- the official nginx is already pulled for nothing else.
#
# Three things have to change for the master process to run without root:
#   - the pid file. The stock config puts it in /var/run, which uid 101
#     cannot write, and nginx exits before it serves anything. It goes in
#     /var/cache/nginx rather than the obvious /tmp: /tmp is world-writable
#     WITH THE STICKY BIT, so a file there that uid 101 does not own cannot
#     be replaced by it -- and `nginx -t` below runs as root and leaves
#     exactly such a file behind, which is enough to make the container exit
#     on first start with a bare "Permission denied". A directory we own
#     outright has no such failure mode.
#   - the scratch directories under /var/cache/nginx, which the workers write
#     buffered request and proxied response bodies into.
#   - the listen ports. Binding below 1024 needs a capability the container
#     does not have, hence 8080 (and 8443 in HTTPS mode) -- which is why the
#     compose files publish "80:8080" (and "443:8443"). Nothing changes for a
#     visitor; the site is still on :80 / :443.
#   - the active config file. select-mode.sh rewrites
#     /etc/nginx/conf.d/default.conf at every start, as this user, so it has
#     to own that file.
# Logs need nothing: the official image already symlinks access.log and
# error.log to stdout/stderr.
FROM nginx:alpine

# The CSP-substituted configs from the builder, not the source ones.
#   conf.d/00-common.conf   http-level settings, both modes
#   conf.d/default.conf     the active mode; plain HTTP until select-mode.sh
#                           says otherwise, so the image is valid even if
#                           started with a different entrypoint
#   persona/                the site (site.conf) and both mode files
COPY --from=builder /app/nginx-built/common.conf /etc/nginx/conf.d/00-common.conf
COPY --from=builder /app/nginx-built/http.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/nginx-built/ /etc/nginx/persona/
COPY --from=builder /app/nginx-built/select-mode.sh /docker-entrypoint.d/15-persona-select-mode.sh
COPY --from=https-check /https-config-ok /etc/nginx/persona/https-config-checked
COPY --from=builder /app/dist /usr/share/nginx/html

RUN sed -i 's|^pid .*|pid /var/cache/nginx/nginx.pid;|' /etc/nginx/nginx.conf \
    # `user nginx;` is meaningless once the master is not root, and nginx
    # warns about it on every single start. Drop it rather than living with a
    # warning that trains people to ignore the log.
    && sed -i '/^user  *nginx;/d' /etc/nginx/nginx.conf \
    && nginx -t \
    # AFTER the config test, so the root-owned pid file it leaves behind is
    # removed rather than shipped, and the directory ends up owned by the
    # user that has to write into it at run time.
    && rm -f /var/cache/nginx/nginx.pid \
    && chown -R nginx:nginx /var/cache/nginx \
    && chown nginx:nginx /etc/nginx/conf.d/default.conf \
    && chmod 0755 /docker-entrypoint.d/15-persona-select-mode.sh

USER nginx

EXPOSE 8080 8443

# /healthz rather than /: in HTTPS mode, / on 8080 redirects to the public
# domain, which this check should not depend on. See nginx.conf.
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
