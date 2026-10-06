#!/usr/bin/env bash
set -e
LOGIN_RES=$(curl -s http://127.0.0.1:8080/v1/auth/login -H "content-type: application/json" -d '{"username":"test","password":"test@123"}')
TOKEN=$(echo "$LOGIN_RES" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

for B in "d7b23dee-9814-48c9-8805-48b61b33e3a9" "921d336d-baa9-4b25-9f9f-f6542bba94cc" "d8467a57-dae8-4012-ba5e-c3254075aa61" "6ddee070-9050-4f55-aaa1-1190654bbc6b"; do
  echo "--- Branch $B ---"
  curl -s "http://127.0.0.1:8080/v1/operations/health/cameras?branchId=$B" -H "authorization: Bearer $TOKEN" | jq '.data.cameras[] | {channel, onlineStatus, reasonCodes}'
done
