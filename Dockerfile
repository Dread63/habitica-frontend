# syntax=docker/dockerfile:1

# --- build stage ---
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines VITE_* env vars into the bundle at build time, not runtime —
# it has to be a build ARG, not a compose `environment:` entry.
ARG VITE_HABITICA_CLIENT_ID
ENV VITE_HABITICA_CLIENT_ID=$VITE_HABITICA_CLIENT_ID
RUN npm run build

# --- serve stage ---
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 127.0.0.1, not localhost: confirmed via a real container run that
# busybox wget resolves "localhost" to ::1 first here, and nginx (per
# nginx.conf's plain `listen 80;`) only binds the IPv4 wildcard — so
# against "localhost" this probe failed with "Connection refused" on
# every single check, permanently reporting the container unhealthy
# despite the app working fine on the mapped host port. 127.0.0.1 sidesteps
# the IPv4/IPv6 resolution order entirely rather than depending on it.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1

EXPOSE 80
