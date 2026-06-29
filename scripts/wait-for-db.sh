#!/usr/bin/env bash
# Wait until MySQL/MariaDB accepts connections (used before app start).
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

MAX_ATTEMPTS="${WAIT_FOR_DB_ATTEMPTS:-30}"
SLEEP_SECONDS="${WAIT_FOR_DB_SLEEP:-2}"

echo "Waiting for database (up to $((MAX_ATTEMPTS * SLEEP_SECONDS))s)..."

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  if npm run db:check >/dev/null 2>&1; then
    echo "Database is ready."
    exit 0
  fi
  echo "  attempt $attempt/$MAX_ATTEMPTS — not ready yet"
  sleep "$SLEEP_SECONDS"
done

echo "ERROR: Database did not become ready in time."
exit 1
