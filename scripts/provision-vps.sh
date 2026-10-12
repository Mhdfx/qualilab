#!/usr/bin/env bash
# One-time preparation of a FRESH VPS (Debian/Ubuntu) for Qualilab LIMS.
# Run as root on the newly reset server:
#   bash provision-vps.sh
#
# Installs Docker + compose, nginx, certbot, a firewall and fail2ban; creates
# the deploy user and the directory layout. It deliberately does NOT deploy the app —
# that is `DEPLOY.md`, run as the deploy user afterwards.

set -euo pipefail

echo "== 1/6 System update =="
apt-get update && apt-get upgrade -y

echo "== 2/6 Docker + compose plugin =="
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
docker compose version

echo "== 3/6 nginx + certbot =="
apt-get install -y nginx certbot python3-certbot-nginx git

echo "== 4/6 Firewall: SSH + web only =="
apt-get install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "== 5/6 fail2ban on sshd (5 failures in 10 min -> banned 1 h) =="
# The same jail as scripts/harden-ssh.sh, which later turns password logins
# off once a key login has been tested (it cannot be done before a key exists).
apt-get install -y fail2ban python3-systemd
mkdir -p /etc/fail2ban/jail.d
cat > /etc/fail2ban/jail.d/qualilab-sshd.local <<'CONF'
# Qualilab — written by provision-vps.sh (same file as scripts/harden-ssh.sh).
[sshd]
enabled  = true
backend  = systemd
maxretry = 5
findtime = 10m
bantime  = 1h
ignoreip = 127.0.0.1/8 ::1
CONF
systemctl enable fail2ban
systemctl restart fail2ban

echo "== 6/6 Deploy user + layout =="
if ! id qualilab >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash qualilab
  usermod -aG docker qualilab
fi
mkdir -p /opt/qualilab /var/backups/qualilab
chown -R qualilab:qualilab /opt/qualilab /var/backups/qualilab

# A read-only deploy key so the VPS pulls from GitHub without personal
# credentials. Print it; add it to the repo (Settings → Deploy keys).
if [ ! -f /home/qualilab/.ssh/id_ed25519 ]; then
  sudo -u qualilab ssh-keygen -t ed25519 -N "" \
    -f /home/qualilab/.ssh/id_ed25519 -C "qualilab-vps-deploy"
fi

echo
echo "================================================================"
echo "Provisioning done. Add this DEPLOY KEY to GitHub (read-only):"
echo "================================================================"
cat /home/qualilab/.ssh/id_ed25519.pub
echo "================================================================"
echo "Then, as the deploy user:  su - qualilab"
echo "  git clone git@github.com:Mhdfx/qualilab.git /opt/qualilab"
echo "  cd /opt/qualilab && cp .env.production.example .env  # fill it in"
echo "  docker compose up -d --build"
echo "Continue with DEPLOY.md (nginx site, certbot, backup cron)."
echo "Once your own SSH key is installed and a key login tested, turn password"
echo "logins off:  sudo bash /opt/qualilab/scripts/harden-ssh.sh"
