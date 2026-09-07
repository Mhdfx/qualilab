#!/usr/bin/env bash
# GO-LIVE step: bans every demonstration account and revokes their sessions.
# Refuses to run until a real ADMIN account exists (see
# prisma/disable-demo-accounts.ts). Run from the repo root on the server:
#   bash scripts/disable-demo-accounts.sh
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose run --rm migrate \
  node node_modules/tsx/dist/cli.mjs prisma/disable-demo-accounts.ts
