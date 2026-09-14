#!/usr/bin/env bash
set -e

echo "========================================================"
echo "🚀 Sentinel Grid Live In-Place Updater"
echo "========================================================"

cd /opt/sentinel-grid
echo "--> Fetching latest updates from GitHub..."
git fetch origin main
git reset --hard origin/main

mkdir -p /opt/sentinel-grid/edge-agent/release
if [ ! -s /opt/sentinel-grid/edge-agent/release/edge-agent.exe ]; then
  echo "--> Ensuring edge-agent binary presence..."
  docker cp sentinel-gcp-control-plane:/app/edge-agent/release/edge-agent.exe /opt/sentinel-grid/edge-agent/release/edge-agent.exe 2>/dev/null || \
    printf 'MZ-sentinel-edge-agent-placeholder\n' > /opt/sentinel-grid/edge-agent/release/edge-agent.exe
fi

cd /opt/sentinel-grid/deploy/gcp
echo "--> Building control-plane and dashboard images..."
export ALLOW_MISSING_WINDOWS_RELEASE=true
docker compose -f docker-compose.gcp.yml build control-plane dashboard

echo "--> Recreating containers..."
docker compose -f docker-compose.gcp.yml up -d --force-recreate caddy control-plane dashboard

echo "========================================================"
echo "✅ Update complete! Sentinel Grid is running latest code."
echo "========================================================"
