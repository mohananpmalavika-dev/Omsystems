#!/usr/bin/env bash
set -e

echo "========================================================"
echo "🚀 Sentinel Grid Live In-Place Updater"
echo "========================================================"

cd /opt/sentinel-grid
echo "--> Fetching latest updates from GitHub..."
git fetch origin main
git reset --hard origin/main

cd /opt/sentinel-grid/deploy/gcp
echo "--> Building control-plane and dashboard images..."
docker compose -f docker-compose.gcp.yml build control-plane dashboard

echo "--> Recreating containers..."
docker compose -f docker-compose.gcp.yml up -d --force-recreate control-plane dashboard

echo "========================================================"
echo "✅ Update complete! Sentinel Grid is running latest code."
echo "========================================================"
