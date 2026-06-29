#!/usr/bin/env bash
# First-time VPS setup (Ubuntu 22/24). Run as root or with sudo:
#   curl -fsSL ... | bash   OR   sudo bash scripts/vps-setup.sh

set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get upgrade -y

# Node.js 20 LTS
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

apt-get install -y git nginx mysql-server build-essential

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

# App directory
APP_DIR="/var/www/qualilab"
mkdir -p "$APP_DIR"

if [ -n "${SUDO_USER:-}" ]; then
  chown -R "$SUDO_USER:$SUDO_USER" "$APP_DIR"
fi

echo ""
echo "=== VPS base setup complete ==="
echo "Node:  $(node -v)"
echo "npm:   $(npm -v)"
echo "PM2:   $(pm2 -v)"
echo ""
echo "Next steps:"
echo "  1. Create MySQL database and user"
echo "  2. Clone/upload app to $APP_DIR"
echo "  3. Copy .env.production.example to .env and fill values"
echo "  4. Run: RUN_SEED=1 bash scripts/deploy.sh"
echo "  5. Configure Nginx: deploy/nginx.conf.example"
echo "  6. Run once (survives reboots): sudo bash scripts/setup-autostart.sh"
