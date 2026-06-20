#!/usr/bin/env bash
# Create MySQL database and user for Qualilab (run once on VPS)
# Usage: sudo bash scripts/setup-database.sh
# Or set env vars: DB_NAME DB_USER DB_PASS

set -euo pipefail

DB_NAME="${DB_NAME:-qualilab_proto}"
DB_USER="${DB_USER:-qualilab_user}"
DB_PASS="${DB_PASS:-}"

if [ -z "$DB_PASS" ]; then
  DB_PASS="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"
  echo "Generated password: $DB_PASS"
fi

mysql -u root <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL

echo ""
echo "Add to .env:"
echo "DATABASE_URL=\"mysql://${DB_USER}:${DB_PASS}@localhost:3306/${DB_NAME}\""
