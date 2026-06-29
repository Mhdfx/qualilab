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

echo "==> Checking database connection"
npm run db:check

echo "==> Running database migrations"
npm run db:migrate:deploy

echo "==> Seeding database"
npm run db:seed

echo "==> Building application"
npm run build

echo "==> Restarting PM2"
chmod +x scripts/start-production.sh
pm2 delete qualilab 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo "==> Waiting for server to start"
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo ""
    echo "=== Deploy complete ==="
    curl -s http://127.0.0.1:3000/api/health
    echo ""
    echo "Logs: pm2 logs qualilab"
    exit 0
  fi
  sleep 2
done

echo "Health check failed"
pm2 describe qualilab || true
pm2 logs qualilab --lines 50 --nostream || true
ss -tlnp | grep 3000 || echo "Nothing listening on port 3000"
exit 1
