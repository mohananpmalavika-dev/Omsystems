#!/usr/bin/env bash
set -e

TOKEN=$(openssl rand -hex 32)
HASH_HEX=$(echo -n "$TOKEN" | sha256sum | awk '{print $1}')
ID=$(cat /proc/sys/kernel/random/uuid)
USER_ID=$(docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -t -A -c "SELECT id FROM users LIMIT 1;")

echo "1. Creating session in DB..."
docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "INSERT INTO live_sessions (id, camera_id, user_id, token_hash, expires_at, purpose) VALUES ('$ID', 'e79fe538-f8db-45c6-949e-d64849a81aee', '$USER_ID', decode('$HASH_HEX', 'hex'), now() + interval '5 minutes', 'view');"

echo "2. Starting live session on Edge Agent..."
START_RES=$(curl -s -X POST https://nottingham-approved-logging-roberts.trycloudflare.com/v1/live/start \
  -H "content-type: application/json" \
  -d "{\"controlPlaneToken\":\"$TOKEN\"}")

echo "Response: $START_RES"

HLS_URL=$(echo "$START_RES" | grep -o '"url":"[^"]*"' | head -n 1 | cut -d'"' -f4)
BEARER=$(echo "$START_RES" | grep -o '"bearerToken":"[^"]*"' | head -n 1 | cut -d'"' -f4)

echo "HLS URL: $HLS_URL"
echo "Bearer: $BEARER"

echo "3. Polling HLS stream for 10 seconds..."
for i in {1..10}; do
  echo "--- Attempt $i ---"
  HTTP_CODE=$(curl -s -o /tmp/hls_out.txt -w "%{http_code}" -H "Authorization: Bearer $BEARER" "$HLS_URL")
  echo "HTTP Status: $HTTP_CODE"
  if [ "$HTTP_CODE" = "200" ]; then
    echo "SUCCESS! Playlist content:"
    cat /tmp/hls_out.txt
    break
  else
    echo "Body: $(cat /tmp/hls_out.txt)"
  fi
  sleep 1
done
