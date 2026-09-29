# Login to get session
LOGIN_RESP=$(curl -s -X POST http://127.0.0.1:8080/v1/auth/login \
  -H "content-type: application/json" \
  -d '{"username":"mgdhanyamohan","password":"SentinelMasterAdmin2026!"}')

echo "Login resp: $LOGIN_RESP"
ACCESS_TOKEN=$(echo "$LOGIN_RESP" | jq -r .accessToken 2>/dev/null || node -e "console.log(JSON.parse(process.argv[1]).accessToken)" "$LOGIN_RESP")

# Create live session
SESSION_RESP=$(curl -s -X POST http://127.0.0.1:8080/v1/cameras/dfb15de3-f067-4c7e-9456-1aed89b17866/live-sessions \
  -H "content-type: application/json" \
  -H "authorization: Bearer $ACCESS_TOKEN" \
  -d '{"profile":"main"}')

echo "Session resp: $SESSION_RESP"
TOKEN=$(echo "$SESSION_RESP" | jq -r .token 2>/dev/null || node -e "console.log(JSON.parse(process.argv[1]).token)" "$SESSION_RESP")

echo "Starting live via edge media relay at http://127.0.0.1:8080/v1/edge-media/09181b97-0674-43ee-9d47-4b8c96f71a6b/v1/live/start..."
START_RESP=$(curl -s -X POST "http://127.0.0.1:8080/v1/edge-media/09181b97-0674-43ee-9d47-4b8c96f71a6b/v1/live/start" \
  -H "content-type: application/json" \
  -d "{\"controlPlaneToken\":\"$TOKEN\",\"profile\":\"main\"}")

echo "Start resp: $START_RESP"
