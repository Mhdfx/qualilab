#!/usr/bin/env bash
# One-time database seed for a Dockerised deployment.
#
# Runs through the `migrate` compose service, i.e. from the BUILD stage
# image: the pruned runtime image carries neither the TypeScript sources the
# seed imports nor tsx's dependencies. The stage is a byproduct of the app
# build, so this costs nothing extra.
#
# Run from the repo root on the server:   bash scripts/seed-docker.sh
# WARNING (same as DEPLOY.md): seed ONLY a fresh installation — it creates
# the demo accounts and demo data on top of whatever is in the database.

set -euo pipefail
cd "$(dirname "$0")/.."

docker compose run --rm migrate \
  node node_modules/tsx/dist/cli.mjs prisma/seed.ts

echo "seed done"
