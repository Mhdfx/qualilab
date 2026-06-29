#!/usr/bin/env bash
# One-time VPS setup: services + PM2 survive reboots.
# Run on the server as root: sudo bash scripts/setup-autostart.sh

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo bash scripts/setup-autostart.sh"
  exit 1
fi

APP_USER="${SUDO_USER:-${APP_USER:-root}}"
APP_DIR="${APP_DIR:-/var/www/qualilab}"

echo "==> Enable MySQL/MariaDB and Nginx on boot"
systemctl enable mysql 2>/dev/null || systemctl enable mariadb 2>/dev/null || true
systemctl enable nginx 2>/dev/null || true
systemctl start mysql 2>/dev/null || systemctl start mariadb 2>/dev/null || true
systemctl start nginx 2>/dev/null || true

echo "==> PM2 startup on boot (user: $APP_USER)"
if ! command -v pm2 >/dev/null 2>&1; then
  echo "ERROR: pm2 not installed. Run: npm install -g pm2"
  exit 1
fi

if [ "$APP_USER" = "root" ]; then
  pm2 startup systemd -u root --hp /root
else
  pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER"
fi

if [ -d "$APP_DIR" ]; then
  echo "==> Saving PM2 process list from $APP_DIR"
  cd "$APP_DIR"
  sudo -u "$APP_USER" pm2 save || pm2 save
else
  echo "WARN: $APP_DIR not found — deploy the app first, then run: pm2 save"
fi

echo ""
echo "=== Autostart configured ==="
echo "After reboot, these should start automatically:"
echo "  - mysql/mariadb"
echo "  - nginx"
echo "  - pm2 → qualilab (via saved process list)"
echo ""
echo "Verify with: systemctl is-enabled mysql nginx && pm2 list"
