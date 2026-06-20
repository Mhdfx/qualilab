#!/usr/bin/env bash
# Deploy or update the app on a VPS (run from project root on the server)
# Usage: bash scripts/deploy.sh

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

echo "==> Running database migrations"
npm run db:migrate:deploy

echo "==> Building application"
npm run build

echo "==> Restarting PM2"
if pm2 describe qualilab >/dev/null 2>&1; then
  pm2 restart qualilab
else
  pm2 start ecosystem.config.cjs
fi

pm2 save

echo ""
echo "=== Deploy complete ==="
echo "Health: curl http://127.0.0.1:3000/api/health"
echo "Logs:   pm2 logs qualilab"
