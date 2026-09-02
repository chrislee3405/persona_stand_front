# --- Stage 1: Build ---
FROM node:20-alpine as builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Non-secret build config (VITE_CDN_BASE) is read by Vite from a frontend
# `.env` file in the build context:
#   - local build   -> your gitignored .env on disk (COPY brings it in)
#   - GitHub Actions -> the workflow writes .env from the repo Variable
#     before `docker build`
# .env is gitignored, so it never reaches GitHub; only .env.local /
# .env.*.local are dockerignored.
RUN npm run build

# --- Stage 2: Production ---
FROM nginx:alpine

# Copy nginx config for SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
