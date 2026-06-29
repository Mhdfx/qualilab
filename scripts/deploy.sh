#!/usr/bin/env bash
# Deploy or update the app on a VPS (run from project root on the server)
# Usage: bash scripts/deploy.sh
# Optional: RUN_SEED=1 bash scripts/deploy.sh   (wipes demo users/invoices — first deploy only)

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERROR: .env file missing. Copy .env.production.example to .env and configure it."
  exit 1
fi

if ! grep -q '^DATABASE_URL=' .env || ! grep -q '^AUTH_SECRET=' .env; then
  echo "ERROR: .env must define DATABASE_URL and AUTH_SECRET"
  exit 1
fi

echo "==> Installing dependencies"
npm ci

echo "==> Checking database connection"
bash scripts/wait-for-db.sh

echo "==> Running database migrations"
npm run db:migrate:deploy

if [ "${RUN_SEED:-0}" = "1" ]; then
  echo "==> Seeding database (RUN_SEED=1)"
  npm run db:seed
else
  echo "==> Skipping seed (set RUN_SEED=1 for first deploy or demo reset)"
fi

echo "==> Building application"
npm run build

echo "==> Restarting PM2"
chmod +x scripts/start-production.sh scripts/wait-for-db.sh scripts/health-watchdog.sh

if pm2 describe qualilab >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

if [ "$(id -u)" -eq 0 ] && ! systemctl is-enabled pm2-root >/dev/null 2>&1 && ! systemctl list-units --type=service | grep -q 'pm2-'; then
  echo ""
  echo "TIP: Run once so the app survives VPS reboots:"
  echo "  sudo bash scripts/setup-autostart.sh"
  echo ""
fi

echo "==> Waiting for server to start"
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo ""
    echo "=== Deploy complete ==="
    curl -s http://127.0.0.1:3000/api/health
    echo ""
    echo "Logs: pm2 logs qualilab"
    echo "Autostart: sudo bash scripts/setup-autostart.sh  (one-time)"
    exit 0
  fi
  sleep 2
done

echo "Health check failed"
pm2 describe qualilab || true
pm2 logs qualilab --lines 50 --nostream || true
ss -tlnp | grep 3000 || echo "Nothing listening on port 3000"
exit 1
