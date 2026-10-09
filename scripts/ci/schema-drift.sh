#!/usr/bin/env bash
# Schema drift check: a database built only by the migrations must match what the
# running server leaves behind, and must satisfy what the models declare.
#
#   1. npm run db:migrate on an EMPTY database (refuses to run on one that has tables)
#   2. dump SHOW CREATE TABLE for every table (sorted, AUTO_INCREMENT removed)
#   3. boot the built server once (node build/server.js), wait for GET /, stop it
#   4. dump again; any difference means boot changed the schema -> exit 1
#   5. compare the compiled models with the database: a model table or column that no
#      migration created -> exit 1
#   6. npm run db:check-indexes: a declared index the migrations did not create -> exit 1
#
# Needs a built tree (npm ci && npm run build) and a reachable MySQL 8. Run locally with
# the variables set explicitly. Do NOT point DB_NAME at a database you care about; step 1
# refuses a database that already has tables, but the migrations would write to it.
#
#   DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=... DB_PASSWORD=... DB_NAME=scratch_db \
#   PORT=3011 scripts/ci/schema-drift.sh
#
# Create the database the way CI does, with the server's default collation:
#   CREATE DATABASE scratch_db;
#
# Variables: DB_NAME, DB_USER, DB_PASSWORD (required); DB_HOST (127.0.0.1), DB_PORT (3306),
# PORT (3000), NODE_ENV (development: the production placeholder-secret guard is not the
# thing under test), BOOT_TIMEOUT seconds (60).
set -euo pipefail

: "${DB_NAME:?DB_NAME is required}"
: "${DB_USER:?DB_USER is required}"
: "${DB_PASSWORD?DB_PASSWORD is required (may be empty)}"
export DB_HOST="${DB_HOST:-127.0.0.1}" DB_PORT="${DB_PORT:-3306}"
export PORT="${PORT:-3000}" NODE_ENV="${NODE_ENV:-development}"
BOOT_TIMEOUT="${BOOT_TIMEOUT:-60}"
export DB_NAME DB_USER DB_PASSWORD

cd "$(dirname "$0")/../.."
# The app takes its database from FORTYKAPICONFIG when that is set, which would bypass DB_NAME.
if [ -n "${FORTYKAPICONFIG:-}" ] || { [ -f .env ] && grep -q '^FORTYKAPICONFIG=' .env; }; then
  echo "FORTYKAPICONFIG is set (environment or .env); it would override DB_NAME. Unset it for this check." >&2
  exit 2
fi
[ -f build/server.js ] || { echo "build/server.js is missing: run npm run build first" >&2; exit 2; }

WORK="$(mktemp -d)"
SERVER_PID=""
stop_server() {
  [ -n "$SERVER_PID" ] || return 0
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    kill -TERM "$SERVER_PID" 2>/dev/null || true
    # central's SIGTERM handler calls app.close() but never process.exit(), so the
    # process may stay up; give it a grace period, then SIGKILL.
    for _ in $(seq 1 10); do kill -0 "$SERVER_PID" 2>/dev/null || break; sleep 1; done
    if kill -0 "$SERVER_PID" 2>/dev/null; then
      echo "server (pid $SERVER_PID) ignored SIGTERM for 10s; sending SIGKILL"
      kill -KILL "$SERVER_PID" 2>/dev/null || true
    fi
  fi
  wait "$SERVER_PID" 2>/dev/null || true
  SERVER_PID=""
}
trap 'stop_server; rm -rf "$WORK"' EXIT

echo "== checking $DB_NAME is empty"
node scripts/ci/schema-drift.js is-empty

echo "== migrating"
npm run db:migrate >"$WORK/migrate.log" 2>&1 || { tail -n 40 "$WORK/migrate.log"; echo "FAIL: db:migrate failed" >&2; exit 1; }
tail -n 3 "$WORK/migrate.log"
node scripts/ci/schema-drift.js dump "$WORK/before.sql"

echo "== booting the built server on port $PORT"
node build/server.js >"$WORK/server.log" 2>&1 &
SERVER_PID=$!
ready=""
for _ in $(seq 1 "$BOOT_TIMEOUT"); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    tail -n 40 "$WORK/server.log"; echo "FAIL: the server exited during boot" >&2; exit 1
  fi
  if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/"; then ready=1; break; fi
  sleep 1
done
if [ -z "$ready" ]; then
  tail -n 40 "$WORK/server.log"; echo "FAIL: GET / did not answer within ${BOOT_TIMEOUT}s" >&2; exit 1
fi
echo "server answered GET /"
stop_server

node scripts/ci/schema-drift.js dump "$WORK/after.sql"
echo "== diffing the schema before and after boot"
if ! diff -u "$WORK/before.sql" "$WORK/after.sql"; then
  echo "FAIL: booting the server changed the schema (diff above)" >&2
  exit 1
fi

echo "== comparing the models with the migrated database"
node scripts/ci/schema-drift.js models || { echo "FAIL: a model declares a table or column no migration creates" >&2; exit 1; }

echo "== npm run db:check-indexes"
npm run db:check-indexes || { echo "FAIL: db:check-indexes reported drift" >&2; exit 1; }

echo "PASS: schema-drift: migrate, boot, empty diff, models match, no index missing ($DB_NAME)"
