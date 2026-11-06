#!/bin/sh
# Wait for the expo stack to become healthy (api directly + through the web proxy).
# Usage: sh scripts/wait_for_health.sh [API_PORT] [WEB_PORT] (defaults 8000/8080).
set -eu
API_PORT=${1:-${OFFLINE_API_PORT:-${TS_API_PORT:-8000}}}
WEB_PORT=${2:-${OFFLINE_WEB_PORT:-${TS_WEB_PORT:-8080}}}
for i in $(seq 1 36); do
  if curl -fsS "http://localhost:${API_PORT}/health" >/dev/null 2>&1 \
  && curl -fsS "http://localhost:${WEB_PORT}/api/health" >/dev/null 2>&1; then
    echo "stack healthy"
    exit 0
  fi
  sleep 5
done
echo "stack did not become healthy" >&2
docker compose ps
docker compose logs --tail=50 api
exit 1
