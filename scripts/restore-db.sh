#!/usr/bin/env bash
# Restore the database from a backup dump.
#   ./scripts/restore-db.sh /var/backups/qualilab/qualilab_2026-08-25_0200.sql.gz
#
# DESTRUCTIVE: replaces the current database with the dump's content.
# It asks for confirmation, and refuses to run without an explicit file.

set -euo pipefail

DUMP="${1:?usage: restore-db.sh <dump.sql.gz>}"
[ -f "$DUMP" ] || { echo "no such file: $DUMP" >&2; exit 1; }
gzip -t "$DUMP"

echo "This will REPLACE the qualilab database with: $DUMP"
read -r -p "Type 'restaurer' to continue: " CONFIRM
[ "$CONFIRM" = "restaurer" ] || { echo "aborted"; exit 1; }

gunzip -c "$DUMP" | docker compose exec -T db \
  mysql -u qualilab -p"${DB_PASSWORD:?DB_PASSWORD not set}" qualilab

echo "restore complete — check the app before telling anyone it is done."
