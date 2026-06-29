#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

: "${PORT:=3000}"

exec node ./node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port "$PORT"
