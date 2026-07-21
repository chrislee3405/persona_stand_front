# --- Stage 1: Build React static files ---
FROM node:20-alpine AS builder

WORKDIR /app

# Copies package.json & package-lock.json (where vite is listed as a dependency)
COPY package*.json ./
RUN npm ci

COPY . .

# "npm run build" triggers your package.json script: "build": "vite build"
RUN npm run build


# --- Stage 2: Serve static build with Nginx ---
FROM nginx:alpine

# Copy compiled static files produced by Vite into Nginx's public directory
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]