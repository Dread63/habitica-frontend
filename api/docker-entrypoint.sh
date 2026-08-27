#!/bin/sh
set -e

# Make the data directory writable by the unprivileged runtime user, then drop
# to it.
#
# This exists because of a real failure: with `USER node` set in the
# Dockerfile and a bind mount like `./data:/data`, the container starts as
# node (uid 1000) but the *host* directory arrives owned by whoever created
# it — root, when Docker auto-creates a missing bind-mount path. SQLite then
# fails with a bare "unable to open database file" and the container
# crash-loops, with nothing in the logs pointing at permissions.
#
# Fixing it here rather than in the Dockerfile is deliberate: a bind mount is
# layered over the image's filesystem at *run* time, so any `chown` performed
# during the build is invisible by the time the process starts. Doing it at
# entrypoint time is the only place it can work, and it means the stack works
# on any NAS without the user having to reason about uid mapping first.
DATA_DIR="$(dirname "${DATA_FILE:-/data/focus.sqlite}")"
mkdir -p "$DATA_DIR"
chown -R node:node "$DATA_DIR" 2>/dev/null || \
  echo "[api] warning: could not chown $DATA_DIR; continuing in case it is already writable"

exec su-exec node "$@"
