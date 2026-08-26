#!/usr/bin/env bash
# One-time database seed for a Dockerised deployment.
#
# The runtime image is a pruned standalone build that carries neither the
# TypeScript sources nor the full node_modules the seed imports, so the seed
# runs from the *build* stage instead — same code, complete dependencies.
# Docker's layer cache makes the extra build essentially free right after
# `docker compose up --build`.
#
# Run from the repo root on the server:   bash scripts/seed-docker.sh
# WARNING (same as DEPLOY.md): seed ONLY a fresh installation — it creates
# the demo accounts and demo data on top of whatever is in the database.

set -euo pipefail
cd "$(dirname "$0")/.."

set -a
. ./.env
set +a

docker build --target build -t qualilab-seed .

# Join the compose network the db container actually lives on.
NET="$(docker inspect "$(docker compose ps -q db)" \
  -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}')"

docker run --rm --network "$NET" \
  -e DATABASE_URL="mysql://qualilab:${DB_PASSWORD}@db:3306/qualilab" \
  -e AUTH_SECRET="${AUTH_SECRET}" \
  -e BETTER_AUTH_URL="${BETTER_AUTH_URL}" \
  -e BETTER_AUTH_TRUSTED_ORIGINS="${BETTER_AUTH_TRUSTED_ORIGINS}" \
  qualilab-seed node node_modules/tsx/dist/cli.mjs prisma/seed.ts

echo "seed done"
