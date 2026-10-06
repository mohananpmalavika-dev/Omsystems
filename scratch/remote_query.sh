#!/usr/bin/env bash
set -e
LOGIN_RES=$(curl -s http://127.0.0.1:8080/v1/auth/login -H "content-type: application/json" -d '{"username":"test","password":"test@123"}')
TOKEN=$(echo "$LOGIN_RES" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
curl -s http://127.0.0.1:8080/v1/operations/health/branches -H "authorization: Bearer $TOKEN" | jq '.data.branches[] | {name, totalCameras, onlineCameras, healthStatus}'
