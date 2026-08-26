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
docker compose exec -T db \
  mysqldump --single-transaction --routines --triggers \
  -u qualilab -p"${DB_PASSWORD:?DB_PASSWORD not set}" qualilab \
  | gzip > "$BACKUP_DIR/qualilab_${STAMP}.sql.gz"

# Verify the dump is a valid gzip with content before trusting it.
gzip -t "$BACKUP_DIR/qualilab_${STAMP}.sql.gz"
SIZE=$(stat -c%s "$BACKUP_DIR/qualilab_${STAMP}.sql.gz")
if [ "$SIZE" -lt 1024 ]; then
  echo "backup suspiciously small (${SIZE} bytes) — investigate" >&2
  exit 1
fi

find "$BACKUP_DIR" -name "qualilab_*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete

echo "backup ok: qualilab_${STAMP}.sql.gz (${SIZE} bytes)"
