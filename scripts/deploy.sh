#!/usr/bin/env bash
# Deploy or update the app on the VPS — run from the project root on the
# server, after `git pull` (or `git checkout <tag>` to roll back):
#
#   bash scripts/deploy.sh                   # Docker Compose (production path)
#   DEPLOY_MODE=pm2 bash scripts/deploy.sh   # bare-metal fallback (PM2)
#   RUN_SEED=1 DEPLOY_MODE=pm2 bash scripts/deploy.sh   # PM2 first deploy only (wipes demo data)
#
# Without DEPLOY_MODE the mode follows .env: the Docker .env defines
# DB_PASSWORD (compose builds DATABASE_URL), the bare-metal one DATABASE_URL.
#
# Docker mode: rebuild + restart (migrations run on boot), wait for
# /api/health, then — only once healthy — reclaim the build cache older than
# 7 days and the dangling images (42.7 GB had piled up by 08/10/2026).
# NEVER `docker system prune --volumes` here: the MySQL data is a volume.

set -euo pipefail

cd "$(dirname "$0")/.."

HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"

if [ ! -f .env ]; then
  echo "ERROR: .env file missing. Copy .env.production.example to .env and configure it."
  exit 1
fi

MODE="${DEPLOY_MODE:-}"
if [ -z "$MODE" ]; then
  if grep -q '^DB_PASSWORD=' .env && [ -f docker-compose.yml ]; then
    MODE="docker"
  else
    MODE="pm2"
  fi
fi

wait_healthy() {
  local tries="$1"
  for _ in $(seq 1 "$tries"); do
    if curl -sf --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

if [ "$MODE" = "docker" ]; then
  if [ "${RUN_SEED:-0}" = "1" ]; then
    echo "ERROR: RUN_SEED is for the PM2 path. With Docker, seed a fresh installation with scripts/seed-docker.sh."
    exit 1
  fi

  echo "==> Building and restarting (docker compose; migrations run on boot)"
  docker compose up -d --build

  echo "==> Waiting for $HEALTH_URL"
  if ! wait_healthy 60; then
    echo "Health check failed — nothing pruned (the cache helps a quick rebuild or rollback)."
    docker compose ps || true
    docker compose logs app --since 10m --tail 100 || true
    exit 1
  fi
  echo "=== Deploy complete ==="
  curl -s "$HEALTH_URL"
  echo

  echo "==> Reclaiming disk: build cache older than 7 days, dangling images"
  # Volumes are never touched: the database lives in one.
  docker builder prune -f --filter until=168h
  docker image prune -f
  df -h / | tail -n 1
  exit 0
fi

if [ "$MODE" != "pm2" ]; then
  echo "ERROR: DEPLOY_MODE must be docker or pm2 (got: $MODE)"
  exit 1
fi

# ---- Bare-metal fallback (PM2) ---------------------------------------------

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
if wait_healthy 10; then
  echo ""
  echo "=== Deploy complete ==="
  curl -s "$HEALTH_URL"
  echo ""
  echo "Logs: pm2 logs qualilab"
  echo "Autostart: sudo bash scripts/setup-autostart.sh  (one-time)"
  exit 0
fi

echo "Health check failed"
pm2 describe qualilab || true
pm2 logs qualilab --lines 50 --nostream || true
ss -tlnp | grep 3000 || echo "Nothing listening on port 3000"
exit 1
