#!/usr/bin/env bash
set -e

ENV_FILE="/opt/sentinel-grid/deploy/gcp/.env"
KEY="bRvPO4bFKAEJqdAFG6+zTHMzyZ7hxhyxL3JT7CeHn/w="

if grep -q "STREAM_VAULT_KEY" "$ENV_FILE"; then
  sed -i "s|STREAM_VAULT_KEY=.*|STREAM_VAULT_KEY=$KEY|" "$ENV_FILE"
else
  echo "STREAM_VAULT_KEY=$KEY" >> "$ENV_FILE"
fi

cd /opt/sentinel-grid/deploy/gcp
docker compose -f docker-compose.gcp.yml up -d --force-recreate control-plane
sleep 6
docker ps
echo "=== LOGS ==="
docker logs --tail 30 sentinel-gcp-control-plane
