#!/usr/bin/env bash
# One-time preparation of a FRESH VPS (Debian/Ubuntu) for Qualilab LIMS.
# Run as root on the newly reset server:
#   bash provision-vps.sh
#
# Installs Docker + compose, nginx, certbot and a firewall; creates the deploy
# user and the directory layout. It deliberately does NOT deploy the app —
# that is `DEPLOY.md`, run as the deploy user afterwards.

set -euo pipefail

echo "== 1/5 System update =="
apt-get update && apt-get upgrade -y

echo "== 2/5 Docker + compose plugin =="
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
docker compose version

echo "== 3/5 nginx + certbot =="
apt-get install -y nginx certbot python3-certbot-nginx git

echo "== 4/5 Firewall: SSH + web only =="
apt-get install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "== 5/5 Deploy user + layout =="
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
