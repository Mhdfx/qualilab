#!/usr/bin/env bash
# Daily database backup — run from cron on the VPS:
#   0 2 * * *  /path/to/qualilab/scripts/backup-db.sh
#
# Keeps 30 days of compressed dumps. The database holds the laboratory's
# results and invoices: this file is the difference between an incident and a
# catastrophe. Test the restore (restore-db.sh) after setting this up, and
# copy the dumps off the machine (rsync/rclone) so a dead disk cannot take
# both the database and its backups.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/qualilab}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date +%Y-%m-%d_%H%M)"

mkdir -p "$BACKUP_DIR"

# Dockerised database (docker-compose.yml). For a bare-metal MySQL, replace
# the docker exec with a plain mysqldump using ~/.my.cnf credentials.
# --no-tablespaces: dumping tablespace metadata needs the PROCESS privilege
# the app user rightly lacks; without the flag every run logs a scary
# access-denied warning.
FINAL="$BACKUP_DIR/qualilab_${STAMP}.sql.gz"
TMP="$BACKUP_DIR/.qualilab_${STAMP}.partial.gz"
trap 'rm -f "$TMP"' EXIT

# Dump to a temporary file: a mysqldump that dies halfway (db container down,
# connection lost) must never leave a truncated-but-valid gzip under the
# final name for restore-db.sh to trust.
docker compose exec -T db   mysqldump --single-transaction --routines --triggers --no-tablespaces   -u qualilab -p"${DB_PASSWORD:?DB_PASSWORD not set}" qualilab   | gzip > "$TMP"

# Verify: valid gzip, real content, and mysqldump's own completion marker
# on the last line — the proof the dump reached the end.
gzip -t "$TMP"
SIZE=$(stat -c%s "$TMP")
if [ "$SIZE" -lt 1024 ]; then
  echo "backup suspiciously small (${SIZE} bytes) — investigate" >&2
  exit 1
fi
if ! gunzip -c "$TMP" | tail -c 300 | grep -q "Dump completed"; then
  echo "backup incomplete: no 'Dump completed' marker — not kept" >&2
  exit 1
fi
mv "$TMP" "$FINAL"
trap - EXIT

find "$BACKUP_DIR" -name "qualilab_*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete

echo "backup ok: $(basename "$FINAL") (${SIZE} bytes)"
