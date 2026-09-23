#!/usr/bin/env bash
set -e

TOKEN=$(openssl rand -hex 32)
HASH_HEX=$(echo -n "$TOKEN" | sha256sum | awk '{print $1}')
ID=$(cat /proc/sys/kernel/random/uuid)
USER_ID=$(docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -t -A -c "SELECT id FROM users LIMIT 1;")

echo "Inserting test session $ID with token $TOKEN for user $USER_ID..."
docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "INSERT INTO live_sessions (id, camera_id, user_id, token_hash, expires_at, purpose) VALUES ('$ID', 'e79fe538-f8db-45c6-949e-d64849a81aee', '$USER_ID', decode('$HASH_HEX', 'hex'), now() + interval '5 minutes', 'view');"

echo "Calling Edge Agent /v1/live/start..."
curl -s -X POST https://nottingham-approved-logging-roberts.trycloudflare.com/v1/live/start \
  -H "content-type: application/json" \
  -d "{\"controlPlaneToken\":\"$TOKEN\"}"

echo ""
