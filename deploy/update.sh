#!/usr/bin/env bash
# Deploy the latest main on the server: backup, pull, rebuild, restart. Run from the app directory.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Backup before update"
docker compose run --rm backup || echo "    (no database yet, skipping backup)"

echo "==> Pull latest code"
git pull --ff-only

echo "==> Rebuild and restart"
docker compose up -d --build
docker image prune -f >/dev/null

echo "==> Reload Caddy (picks up Caddyfile changes)"
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile \
  || docker compose restart caddy

echo "==> Health"
sleep 5
docker compose ps
docker compose exec -T app dotnet Agentic.Api.dll --healthcheck && echo "    app is healthy"
