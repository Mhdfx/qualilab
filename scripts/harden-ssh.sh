#!/usr/bin/env bash
# SSH hardening for the Qualilab VPS (Debian/Ubuntu) — key login only, plus
# fail2ban on sshd. Run as root, from a session opened WITH A KEY:
#
#   sudo bash scripts/harden-ssh.sh                       # asks for « yes »
#   sudo bash scripts/harden-ssh.sh --i-tested-key-login  # non-interactive
#   sudo bash scripts/harden-ssh.sh --user qualilab ...   # whose keys to check
#
# Why: the server took ~21 000 failed password logins a day (PROGRESS,
# 08/10/2026). With passwords off, those attempts cannot succeed; fail2ban
# bans what keeps knocking.
#
# What it does, in this order — and refuses to go further at the first doubt:
#   1. checks the operator's ~/.ssh/authorized_keys holds at least one key
#      (the sudo user's, or --user, or root's) and that the operator confirms
#      a key login was tested in ANOTHER terminal;
#   2. writes /etc/ssh/sshd_config.d/10-qualilab.conf — PasswordAuthentication
#      no, KbdInteractiveAuthentication no, PermitRootLogin prohibit-password
#      (sshd keeps the FIRST value it reads and Ubuntu includes sshd_config.d
#      first, in name order: « 10- » wins over a cloud-init « 50- » file);
#   3. validates with `sshd -t` (restores the previous file on failure), then
#      reloads ssh — open sessions stay open;
#   4. installs fail2ban with an sshd jail: 5 failures in 10 min → banned 1 h.
#
# Idempotent: running it again rewrites the same two files.
# Undo (from the provider's console if locked out):
#   rm /etc/ssh/sshd_config.d/10-qualilab.conf && systemctl reload ssh

set -euo pipefail

SSHD_DROPIN="/etc/ssh/sshd_config.d/10-qualilab.conf"
JAIL="/etc/fail2ban/jail.d/qualilab-sshd.local"
CONFIRMED=0
OPERATOR="${SUDO_USER:-root}"

usage() {
  sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --i-tested-key-login) CONFIRMED=1; shift ;;
    --user) [ $# -ge 2 ] || { echo "--user needs a user name" >&2; exit 2; }; OPERATOR="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo bash $0" >&2
  exit 1
fi

# ---- 1. A key must exist, and must have been tried ------------------------

HOME_DIR="$(getent passwd "$OPERATOR" | cut -d: -f6 || true)"
if [ -z "$HOME_DIR" ]; then
  echo "REFUSED: unknown user « $OPERATOR »." >&2
  exit 1
fi
KEYS_FILE="$HOME_DIR/.ssh/authorized_keys"
KEY_PATTERN='(^|[[:space:]])(ssh-(ed25519|rsa|dss)|ecdsa-sha2-nistp(256|384|521)|sk-(ssh-ed25519|ecdsa-sha2-nistp256)@openssh\.com)[[:space:]]+AAAA'
KEY_COUNT=0
if [ -r "$KEYS_FILE" ]; then
  # A commented-out key (« # ssh-ed25519 AAAA… ») lets nobody in: not counted.
  KEY_COUNT="$(grep -Ev '^[[:space:]]*#' "$KEYS_FILE" | grep -Ec "$KEY_PATTERN" || true)"
fi
if [ "$KEY_COUNT" -lt 1 ]; then
  echo "REFUSED: $KEYS_FILE holds no SSH public key." >&2
  echo "Install yours first (from your PC: ssh-copy-id $OPERATOR@<server>), log in with it, then run this again." >&2
  exit 1
fi
echo "Found $KEY_COUNT key(s) in $KEYS_FILE."

if [ "$CONFIRMED" -ne 1 ]; then
  if [ ! -t 0 ]; then
    echo "REFUSED: no terminal to confirm. After testing a key login, pass --i-tested-key-login." >&2
    exit 1
  fi
  echo
  echo "Password logins are about to be turned OFF for every account."
  echo "In ANOTHER terminal, open a NEW session with your key and check it works:"
  echo "    ssh -o PreferredAuthentications=publickey -o PasswordAuthentication=no $OPERATOR@<server>"
  echo "Keep THIS session open until the end."
  printf 'Did the key login work? Type « yes » to continue: '
  read -r ANSWER
  if [ "$ANSWER" != "yes" ]; then
    echo "Stopped: nothing was changed."
    exit 1
  fi
fi

# ---- 2–3. sshd drop-in, validated before it is loaded ---------------------

command -v sshd >/dev/null 2>&1 || { echo "sshd not found (openssh-server)." >&2; exit 1; }
mkdir -p "$(dirname "$SSHD_DROPIN")"
if ! grep -Eqs '^[[:space:]]*Include[[:space:]]+/etc/ssh/sshd_config\.d/\*\.conf' /etc/ssh/sshd_config; then
  echo "REFUSED: /etc/ssh/sshd_config does not include sshd_config.d/*.conf — add the Include line first." >&2
  exit 1
fi

BACKUP=""
if [ -f "$SSHD_DROPIN" ]; then
  BACKUP="$(mktemp)"
  cp -p "$SSHD_DROPIN" "$BACKUP"
fi

cat > "$SSHD_DROPIN.new" <<'CONF'
# Qualilab — written by scripts/harden-ssh.sh. Key login only.
# Read before the other drop-ins (name order) so these values win.
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
CONF
chmod 644 "$SSHD_DROPIN.new"
mv "$SSHD_DROPIN.new" "$SSHD_DROPIN"

# sshd -t needs its privilege-separation directory, absent while sshd is
# socket-activated and idle.
mkdir -p /run/sshd
if ! sshd -t; then
  echo "sshd -t refused the configuration: restoring the previous state." >&2
  if [ -n "$BACKUP" ]; then mv "$BACKUP" "$SSHD_DROPIN"; else rm -f "$SSHD_DROPIN"; fi
  exit 1
fi
if [ -n "$BACKUP" ]; then rm -f "$BACKUP"; fi

# The effective values (what sshd will really apply).
EFFECTIVE="$(sshd -T 2>/dev/null | grep -Ei '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin) ' || true)"
echo "$EFFECTIVE"
if ! grep -qi '^passwordauthentication no' <<<"$EFFECTIVE"; then
  echo "WARNING: sshd still reports password authentication on — check the other files of sshd_config.d." >&2
  exit 1
fi

# Open sessions survive a reload. Ubuntu 24.04 may run sshd socket-activated:
# then each new connection reads the new configuration by itself.
if systemctl is-active --quiet ssh 2>/dev/null; then
  systemctl reload ssh
elif systemctl is-active --quiet sshd 2>/dev/null; then
  systemctl reload sshd
else
  echo "ssh.service is not running (socket activation): new connections read the new configuration."
fi
echo "sshd: key login only."

# ---- 4. fail2ban ----------------------------------------------------------

export DEBIAN_FRONTEND=noninteractive
apt-get install -y fail2ban python3-systemd >/dev/null
mkdir -p "$(dirname "$JAIL")"
cat > "$JAIL" <<'CONF'
# Qualilab — written by scripts/harden-ssh.sh (same file as provision-vps.sh).
[sshd]
enabled  = true
backend  = systemd
maxretry = 5
findtime = 10m
bantime  = 1h
ignoreip = 127.0.0.1/8 ::1
CONF
systemctl enable fail2ban >/dev/null 2>&1 || true
systemctl restart fail2ban
sleep 2
fail2ban-client status sshd

echo
echo "Done. From your PC, check once more in a NEW terminal that the key login works"
echo "and that a password login is refused:"
echo "    ssh -o PubkeyAuthentication=no $OPERATOR@<server>   # → Permission denied (publickey)"
