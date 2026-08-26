#!/usr/bin/env bash
# First deployment on the Qualilab VPS — run ONCE as root:
#
#   curl -fsSL https://raw.githubusercontent.com/Mhdfx/qualilab/master/scripts/vps-first-deploy.sh | bash
#
# Written for the existing server (185.217.126.53) that hosted the PM2
# prototype: nginx and ufw are already configured there, so this script
# retires the prototype, installs Docker, creates the deploy user, clones the
# repo, generates the secrets, builds and starts the stack, seeds the demo
# accounts and installs the daily backup cron. Idempotent — safe to re-run
# if a step fails partway.

set -euo pipefail

APP_DIR=/opt/qualilab
REPO=https://github.com/Mhdfx/qualilab.git
PUBLIC_URL=http://185.217.126.53

echo "== 1/8 Retire the old PM2 prototype =="
if command -v pm2 >/dev/null 2>&1; then
  pm2 delete all >/dev/null 2>&1 || true
  pm2 save --force >/dev/null 2>&1 || true
fi
systemctl disable --now pm2-root >/dev/null 2>&1 || true
systemctl disable --now mysql >/dev/null 2>&1 || true
if [ -d /var/www/qualilab ]; then
  mv /var/www/qualilab /root/qualilab-old-prototype-archive
  echo "  old app archived to /root/qualilab-old-prototype-archive"
fi
ufw delete allow 3000 >/dev/null 2>&1 || true
ufw delete allow 3000 >/dev/null 2>&1 || true

echo "== 2/8 Docker =="
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
docker compose version

echo "== 3/8 Deploy user =="
id qualilab >/dev/null 2>&1 || useradd --create-home --shell /bin/bash qualilab
usermod -aG docker qualilab
mkdir -p "$APP_DIR" /var/backups/qualilab
chown qualilab:qualilab "$APP_DIR" /var/backups/qualilab

echo "== 4/8 Clone =="
if [ ! -d "$APP_DIR/.git" ]; then
  sudo -u qualilab git clone "$REPO" "$APP_DIR"
else
  sudo -u qualilab git -C "$APP_DIR" pull
fi
chmod +x "$APP_DIR"/scripts/*.sh 2>/dev/null || true

echo "== 5/8 Secrets =="
if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" <<EOF
DB_PASSWORD=$(openssl rand -hex 24)
DB_ROOT_PASSWORD=$(openssl rand -hex 24)
AUTH_SECRET=$(openssl rand -base64 32)
BETTER_AUTH_URL=$PUBLIC_URL
BETTER_AUTH_TRUSTED_ORIGINS=$PUBLIC_URL
AUTH_COOKIE_SECURE=false
NEXT_PUBLIC_DEMO_MODE=true
EOF
  chown qualilab:qualilab "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  echo "  generated a new .env (secrets stay on this server only)"
else
  echo "  .env already exists — kept as is"
fi

echo "== 6/8 Build and start (several minutes on first run) =="
cd "$APP_DIR"
sudo -u qualilab docker compose up -d --build

printf "  waiting for the app"
HEALTH=""
for _ in $(seq 1 90); do
  if curl -fsS localhost:3000/api/health >/dev/null 2>&1; then HEALTH=ok; break; fi
  printf "."
  sleep 5
done
echo
if [ "$HEALTH" != ok ]; then
  echo "  app did not answer on /api/health — check: docker compose logs app" >&2
  exit 1
fi
echo "  health OK"

echo "== 7/8 Seed demo accounts (fresh database only) =="
DBPASS="$(grep '^DB_PASSWORD=' .env | cut -d= -f2-)"
USERS="$(sudo -u qualilab docker compose exec -T db \
  mysql -u qualilab -p"$DBPASS" -N -e 'SELECT COUNT(*) FROM User' qualilab 2>/dev/null || echo 0)"
if [ "${USERS:-0}" = "0" ]; then
  sudo -u qualilab bash scripts/seed-docker.sh
else
  echo "  $USERS users already present — seed skipped"
fi

echo "== 8/8 Daily backup cron (02:00, 30-day retention) =="
cat > /etc/cron.d/qualilab-backup <<'EOF'
0 2 * * * qualilab bash -c 'cd /opt/qualilab && set -a && . ./.env && set +a && bash scripts/backup-db.sh' >> /var/backups/qualilab/backup.log 2>&1
EOF
chmod 644 /etc/cron.d/qualilab-backup

systemctl reload nginx || true

echo
echo "================ DEPLOYED ================"
sudo -u qualilab docker compose ps
echo
ufw status | head -12
echo
echo "App: $PUBLIC_URL — the login page should show the demo-accounts panel."
