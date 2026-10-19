#!/usr/bin/env bash
set -e

sed -i "s|MEDIA_GATEWAY_SHARED_KEY=.*|MEDIA_GATEWAY_SHARED_KEY=9a8f4c2e6b1d8a5e3f7c0b2d4a6e8f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d|" /opt/sentinel-grid/deploy/gcp/.env
sed -i "s|REPORT_DOWNLOAD_SECRET=.*|REPORT_DOWNLOAD_SECRET=8e1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d9a8f4c2e6b1d8a5e3f7c0b2d4a6e|" /opt/sentinel-grid/deploy/gcp/.env

cd /opt/sentinel-grid/deploy/gcp
docker compose -f docker-compose.gcp.yml up -d --force-recreate control-plane media-gateway
sleep 8
docker ps
echo "=== CONTROL PLANE LOGS ==="
docker logs --tail 30 sentinel-gcp-control-plane
