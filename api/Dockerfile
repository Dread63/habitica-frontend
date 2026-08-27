# syntax=docker/dockerfile:1

# No build stage: this service has zero dependencies and no transpile step —
# `node src/server.js` runs the source directly. node:sqlite is built into
# Node 24, which is the whole reason SQLite here costs no native module and
# no per-architecture compilation.
FROM node:24-alpine

# su-exec drops privileges in the entrypoint. The container has to *start* as
# root so it can fix ownership of a bind-mounted data directory (see
# docker-entrypoint.sh); it does not stay root.
RUN apk add --no-cache su-exec

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# The database lives on a mounted volume, never in the image — the container
# stays disposable and `docker compose down` can't take your focus log with it.
ENV DATA_FILE=/data/focus.sqlite
ENV PORT=8081

# 127.0.0.1, not localhost — busybox resolves localhost to ::1 first while
# the server binds IPv4, which silently fails every probe. Same bug this
# repo already hit once in the frontend image; see that Dockerfile.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8081/api/health || exit 1

EXPOSE 8081
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "src/server.js"]
