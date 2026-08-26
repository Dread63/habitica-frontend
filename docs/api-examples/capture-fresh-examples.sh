#!/usr/bin/env bash
# Capture real, current example payloads from YOUR OWN Habitica account and drop them
# into this directory, replacing the 2017-vintage examples vendored from Habitica's docs.
#
# The examples already in this directory are Habitica's own official apidoc fixtures —
# the field SHAPES are authoritative and current (cross-checked against the live Mongoose
# schemas in ../vendor/), but the actual IDs/dates are ~8 years old and your account's
# real tags/tasks will look different. Running this script gives Claude (or you) fresher,
# personally-relevant ground truth without guessing.
#
# USAGE:
#   1. Get your credentials: https://habitica.com/user/settings/api  (User ID + API Token)
#   2. export HABITICA_USER_ID=xxxxx
#      export HABITICA_API_TOKEN=xxxxx
#   3. ./capture-fresh-examples.sh
#
# SECURITY: this only ever runs on your machine, only ever talks to habitica.com, and
# never sends your token anywhere else. Do NOT paste your API token into a chat session —
# there's no need to; this script is meant to be run locally and just leaves sanitized
# JSON files behind for you (or Claude, reading them from disk) to use.

set -euo pipefail

: "${HABITICA_USER_ID:?Set HABITICA_USER_ID first (from habitica.com/user/settings/api)}"
: "${HABITICA_API_TOKEN:?Set HABITICA_API_TOKEN first (from habitica.com/user/settings/api)}"

CLIENT_HEADER="${HABITICA_USER_ID}-habitica-modern-frontend-docs"
OUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/live"
mkdir -p "$OUT_DIR"

call() {
  local method="$1" path="$2" outfile="$3"
  echo "→ ${method} ${path}"
  curl -sS -X "${method}" "https://habitica.com/api/v3${path}" \
    -H "x-api-user: ${HABITICA_USER_ID}" \
    -H "x-api-key: ${HABITICA_API_TOKEN}" \
    -H "x-client: ${CLIENT_HEADER}" \
    -H "Content-Type: application/json" \
    | node -e "process.stdout.write(JSON.stringify(JSON.parse(require('fs').readFileSync(0,'utf8')), null, 2))" \
    > "${OUT_DIR}/${outfile}"
}

call GET "/tasks/user" "tasks-user-live.json"
call GET "/tags" "tags-live.json"
call GET "/user" "user-live.json"

cat <<EOF

Done. Wrote sanitized-by-nature (these are just your own task/tag/user JSON, nothing
redacted needed beyond not sharing your API token itself) live examples to:
  ${OUT_DIR}/

Before committing these to the repo:
  - Skim user-live.json — it's large (equipment, purchase history, party info, etc.);
    trim it down to just the fields you actually reference (profile, stats, preferences,
    tags, tasksOrder) rather than committing the whole thing.
  - tasks-user-live.json and tags-live.json are fine to commit as-is; they're exactly the
    shape the app consumes.
  - Your x-api-key / x-api-token are NEVER written into these files — only your task/tag
    data is. Still, if any task text/notes contain anything private, edit before committing.
EOF
