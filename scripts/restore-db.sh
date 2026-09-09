#!/usr/bin/env bash
# Restore the database from a backup dump.
#   ./scripts/restore-db.sh /var/backups/qualilab/qualilab_2026-08-25_0200.sql.gz
#
# DESTRUCTIVE: replaces the current database with the dump's content.
# It asks for confirmation, and refuses to run without an explicit file.
#
# The database is dropped and recreated first, so tables that did not exist
# when the dump was taken disappear with it — then the pending migrations are
# replayed, which brings an older dump up to the schema the running code
# expects. Restoring straight over the live tables would leave newer tables
# behind with no migration record, and the next `docker compose up` would
# fail on "table already exists".

set -euo pipefail
cd "$(dirname "$0")/.."

DUMP="${1:?usage: restore-db.sh <dump.sql.gz>}"
[ -f "$DUMP" ] || { echo "no such file: $DUMP" >&2; exit 1; }
gzip -t "$DUMP"

if [ -z "${DB_PASSWORD:-}" ] && [ -f .env ]; then
  DB_PASSWORD="$(grep '^DB_PASSWORD=' .env | cut -d= -f2-)"
fi
: "${DB_PASSWORD:?DB_PASSWORD not set (and not found in .env)}"

echo "This will REPLACE the qualilab database with: $DUMP"
read -r -p "Type 'restaurer' to continue: " CONFIRM
[ "$CONFIRM" = "restaurer" ] || { echo "aborted"; exit 1; }

echo "== 1/4 Stopping the app =="
docker compose stop app

echo "== 2/4 Recreating the database =="
docker compose exec -T db mysql -u qualilab -p"$DB_PASSWORD" -e \
  "DROP DATABASE IF EXISTS qualilab; CREATE DATABASE qualilab CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo "== 3/4 Loading the dump =="
gunzip -c "$DUMP" | docker compose exec -T db \
  mysql -u qualilab -p"$DB_PASSWORD" qualilab

echo "== 4/4 Replaying pending migrations and restarting the app =="
docker compose up migrate
docker compose up -d app

echo "restore complete — check the app before telling anyone it is done."
