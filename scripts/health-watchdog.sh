#!/usr/bin/env bash
# Optional cron watchdog: restart the app if /api/health fails.
# Example crontab (every 5 min): */5 * * * * /var/www/qualilab/scripts/health-watchdog.sh >> /var/log/qualilab-watchdog.log 2>&1

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/qualilab}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
PM2_APP="${PM2_APP:-qualilab}"

cd "$APP_DIR"

if curl -sf --max-time 10 "$HEALTH_URL" | grep -q '"status":"ok"'; then
  exit 0
fi

echo "$(date -Is) HEALTH FAIL — restarting $PM2_APP"
pm2 restart "$PM2_APP" --update-env || pm2 start ecosystem.config.cjs

sleep 5
if curl -sf --max-time 10 "$HEALTH_URL" | grep -q '"status":"ok"'; then
  echo "$(date -Is) Recovered after restart"
  exit 0
fi

echo "$(date -Is) Still unhealthy after restart — check: pm2 logs $PM2_APP"
exit 1
