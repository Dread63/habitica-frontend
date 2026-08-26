# syntax=docker/dockerfile:1

# --- build stage ---
# --platform=$BUILDPLATFORM pins this stage to the *builder's* architecture
# instead of the target's. The stage's only output is a directory of static
# files, which is architecture-independent, so there is nothing to gain from
# running it under emulation — and plenty to lose: an emulated `npm ci` +
# `vite build` for linux/arm64 takes minutes rather than seconds. Only the
# nginx stage below is actually built per-architecture.
#
# The app has no build-time configuration at all (no ARGs, no VITE_* vars —
# see src/vite-env.d.ts), which is what makes one published image usable by
# any account rather than personal to whoever built it.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
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
