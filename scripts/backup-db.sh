#!/usr/bin/env bash
# Daily database backup — run from cron on the VPS:
#   0 2 * * *  /path/to/qualilab/scripts/backup-db.sh
#
# Keeps RETENTION_DAYS (30) days of compressed dumps on this machine and, when
# BACKUP_REMOTE is set, a copy off it. The database holds the laboratory's
# results and invoices: this file is the difference between an incident and a
# catastrophe. Test the restore (restore-db.sh) after setting this up.
#
# Off-site copy — opt-in (DEPLOY.md « Backups »), read from the environment
# (the cron line sources .env):
#   BACKUP_REMOTE         unset → « offsite skipped (BACKUP_REMOTE not set) ».
#                         Either an rclone remote:path (e.g. qualilab-crypt:
#                         or qualilab-crypt:dumps) — recommended with an rclone
#                         *crypt* remote, which encrypts names and content —
#                         or user@host:/path for rsync over SSH (path without
#                         spaces, directory created beforehand).
#   BACKUP_SSH_KEY        rsync form only: the dedicated private key
#                         (default ~/.ssh/qualilab_backup).
#   BACKUP_GPG_RECIPIENT  optional: encrypt the dump for this gpg recipient
#                         (public key imported for the cron user) before it
#                         leaves; the private key never lives on this server.
# The copy is checked (remote size = local size). A failed copy logs
# « offsite FAILED: … » and exits 1 so cron and the log show it; the local
# dump is kept either way.
#
# Only the dated dumps (qualilab_AAAA-MM-JJ_HHMM.sql.gz) rotate, here and
# off-site: a dump named by hand — qualilab_avant-phase-9.sql.gz, the phase 9
# restore point — is never pruned.
#
# Journal of the runs (RETOUR-LABO-28-10.md L2 — Q97 « Est-ce qu'on peut
# récupérer un fichier de suivi de la sauvegarde ? »): every run, failed or
# not, appends ONE line to $BACKUP_DIR/journal/backup-journal.csv
# (BACKUP_JOURNAL_DIR to move it), separated by « ; »:
#   date (UTC, ISO 8601) ; statut (ok | echec) ; fichier ; octets ; sha256 ;
#   copie hors site (ok | ignoree | echec | non-tentee) ; message
# The app mounts that directory read-only (docker-compose.yml) and shows the
# last runs in Administration → « Sauvegardes », with a warning when the last
# run failed or is older than 26 h; the file is downloadable there. The line
# is written by the EXIT trap, so a run killed by `set -e` is journalled too.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/qualilab}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date +%Y-%m-%d_%H%M)"
ROTATING="qualilab_????-??-??_????.sql.gz"

mkdir -p "$BACKUP_DIR"

# ---- Journal of the run (L2) -------------------------------------------------

JOURNAL_DIR="${BACKUP_JOURNAL_DIR:-$BACKUP_DIR/journal}"
JOURNAL="$JOURNAL_DIR/backup-journal.csv"
JOURNAL_HEADER="date;statut;fichier;octets;sha256;copie_hors_site;message"
STARTED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
RESULT_FILE=""
RESULT_SIZE=""
RESULT_SHA=""
OFFSITE="non-tentee"
MESSAGE=""
CLEANUP=()

# A field never carries the separator nor a line break.
journal_field() {
  printf '%s' "$1" | tr ';\r\n' ',  '
}

finish() {
  local code=$?
  local file
  for file in "${CLEANUP[@]}"; do rm -f "$file"; done
  local status="ok"
  if [ "$code" -ne 0 ]; then
    status="echec"
    [ -n "$MESSAGE" ] || MESSAGE="échec inattendu (code $code)"
  fi
  if mkdir -p "$JOURNAL_DIR" 2>/dev/null; then
    [ -s "$JOURNAL" ] || echo "$JOURNAL_HEADER" > "$JOURNAL"
    printf '%s;%s;%s;%s;%s;%s;%s\n' "$STARTED" "$status" "$(journal_field "$RESULT_FILE")" "$RESULT_SIZE" "$RESULT_SHA" "$OFFSITE" \
      "$(journal_field "$MESSAGE")" >> "$JOURNAL" || echo "backup journal not written: $JOURNAL" >&2
  else
    echo "backup journal not written: cannot create $JOURNAL_DIR" >&2
  fi
  exit "$code"
}
trap finish EXIT

# Stop the run with a message the journal keeps.
fail() {
  MESSAGE="$*"
  echo "$*" >&2
  exit 1
}

if ! [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || [ "$RETENTION_DAYS" -lt 1 ]; then
  fail "RETENTION_DAYS must be a whole number of days ≥ 1 (got: $RETENTION_DAYS)"
fi

# Dockerised database (docker-compose.yml). For a bare-metal MySQL, replace
# the docker exec with a plain mysqldump using ~/.my.cnf credentials.
# --no-tablespaces: dumping tablespace metadata needs the PROCESS privilege
# the app user rightly lacks; without the flag every run logs a scary
# access-denied warning.
FINAL="$BACKUP_DIR/qualilab_${STAMP}.sql.gz"
TMP="$BACKUP_DIR/.qualilab_${STAMP}.partial.gz"
CLEANUP+=("$TMP")
[ -n "${DB_PASSWORD:-}" ] || fail "DB_PASSWORD not set"
MESSAGE="mysqldump a échoué (base injoignable ?)"

# Dump to a temporary file: a mysqldump that dies halfway (db container down,
# connection lost) must never leave a truncated-but-valid gzip under the
# final name for restore-db.sh to trust.
docker compose exec -T db   mysqldump --single-transaction --routines --triggers --no-tablespaces   -u qualilab -p"${DB_PASSWORD:?DB_PASSWORD not set}" qualilab   | gzip > "$TMP"

# Verify: valid gzip, real content, and mysqldump's own completion marker
# on the last line — the proof the dump reached the end.
gzip -t "$TMP" || fail "backup is not a valid gzip — not kept"
MESSAGE=""
SIZE=$(stat -c%s "$TMP")
if [ "$SIZE" -lt 1024 ]; then
  fail "backup suspiciously small (${SIZE} bytes) — investigate"
fi
if ! gunzip -c "$TMP" | tail -c 300 | grep -q "Dump completed"; then
  fail "backup incomplete: no 'Dump completed' marker — not kept"
fi
mv "$TMP" "$FINAL"
RESULT_FILE="$(basename "$FINAL")"
RESULT_SIZE="$SIZE"
RESULT_SHA="$(sha256sum "$FINAL" | cut -d' ' -f1)"

find "$BACKUP_DIR" -maxdepth 1 -name "$ROTATING" -mtime "+${RETENTION_DAYS}" -delete

echo "backup ok: $(basename "$FINAL") (${SIZE} bytes)"

# ---- Off-site copy (opt-in) ------------------------------------------------

offsite_fail() {
  OFFSITE="echec"
  fail "offsite FAILED: $*"
}

if [ -z "${BACKUP_REMOTE:-}" ]; then
  OFFSITE="ignoree"
  echo "offsite skipped (BACKUP_REMOTE not set)"
  exit 0
fi

case "$BACKUP_REMOTE" in
  *@*:/*) MODE="rsync" ;;
  *:*) MODE="rclone" ;;
  *) offsite_fail "BACKUP_REMOTE must be an rclone remote:path or user@host:/path (got: $BACKUP_REMOTE)" ;;
esac
REMOTE="${BACKUP_REMOTE%/}"

UPLOAD="$FINAL"
if [ -n "${BACKUP_GPG_RECIPIENT:-}" ]; then
  command -v gpg >/dev/null 2>&1 || offsite_fail "gpg is not installed (apt install gnupg)"
  UPLOAD="$FINAL.gpg"
  # The encrypted copy only exists to travel: removed whatever happens.
  CLEANUP+=("$UPLOAD")
  # --trust-model always: the recipient's key was imported on purpose by
  # the operator; there is no web of trust on a server.
  gpg --batch --yes --trust-model always --recipient "$BACKUP_GPG_RECIPIENT" \
    --output "$UPLOAD" --encrypt "$FINAL" \
    || offsite_fail "gpg encryption for $BACKUP_GPG_RECIPIENT"
fi
NAME="$(basename "$UPLOAD")"
LOCAL_SIZE="$(stat -c%s "$UPLOAD")"

if [ "$MODE" = "rclone" ]; then
  command -v rclone >/dev/null 2>&1 || offsite_fail "rclone is not installed (apt install rclone)"
  # A remote given as « name: » (its root) must not become « name:/file ».
  case "$REMOTE" in *:) TARGET="$REMOTE$NAME" ;; *) TARGET="$REMOTE/$NAME" ;; esac
  rclone copyto "$UPLOAD" "$TARGET" || offsite_fail "rclone copy to $TARGET"
  # On a crypt remote, rclone reports the decrypted size: the local one.
  REMOTE_SIZE="$(rclone lsf --format s "$TARGET" 2>/dev/null | head -n 1 || true)"
  if [ "$REMOTE_SIZE" != "$LOCAL_SIZE" ]; then
    offsite_fail "$NAME: remote size ${REMOTE_SIZE:-absent} ≠ local size $LOCAL_SIZE"
  fi
  # --max-depth 1: only the dumps this script wrote, never a sub-folder of
  # the remote (same as `find -maxdepth 1` on the rsync side).
  rclone delete --max-depth 1 --min-age "${RETENTION_DAYS}d" --include "$ROTATING" --include "$ROTATING.gpg" "$REMOTE" \
    || offsite_fail "pruning $REMOTE (the copy itself succeeded: $NAME)"
else
  command -v rsync >/dev/null 2>&1 || offsite_fail "rsync is not installed (apt install rsync)"
  HOST="${REMOTE%%:*}"
  RPATH="${REMOTE#*:}"
  KEY="${BACKUP_SSH_KEY:-$HOME/.ssh/qualilab_backup}"
  [ -r "$KEY" ] || offsite_fail "SSH key $KEY is not readable"
  # BatchMode: never wait for a password or a host-key prompt in cron (the
  # operator accepts the host key once by hand, see DEPLOY.md).
  SSH=(ssh -i "$KEY" -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=30)
  # --times: the remote copy keeps the dump's date, which the pruning reads.
  rsync --times --partial -e "$(printf '%q ' "${SSH[@]}")" "$UPLOAD" "$HOST:$RPATH/" \
    || offsite_fail "rsync to $HOST:$RPATH"
  REMOTE_SIZE="$("${SSH[@]}" "$HOST" "stat -c%s $(printf '%q' "$RPATH/$NAME")" 2>/dev/null || true)"
  if [ "$REMOTE_SIZE" != "$LOCAL_SIZE" ]; then
    offsite_fail "$NAME: remote size ${REMOTE_SIZE:-absent} ≠ local size $LOCAL_SIZE"
  fi
  "${SSH[@]}" "$HOST" "find $(printf '%q' "$RPATH") -maxdepth 1 \\( -name $(printf '%q' "$ROTATING") -o -name $(printf '%q' "$ROTATING.gpg") \\) -mtime +$RETENTION_DAYS -delete" \
    || offsite_fail "pruning $HOST:$RPATH (the copy itself succeeded: $NAME)"
fi

OFFSITE="ok"
echo "offsite ok: $NAME ($LOCAL_SIZE bytes → $REMOTE)"
