#!/usr/bin/env bash
set -e

cd /opt/sentinel-grid
echo "=== 1. Pulling latest code ==="
git fetch origin main
git reset --hard origin/main

echo "=== 1.5. Freeing build cache to prevent ENOSPC ==="
docker builder prune -af --filter until=2h || true
docker image prune -f || true

echo "=== 2. Building services sequentially ==="
cd /opt/sentinel-grid/deploy/aws

docker compose -f docker-compose.aws.yml build control-plane
docker compose -f docker-compose.aws.yml build dashboard
docker compose -f docker-compose.aws.yml build media-gateway || true
docker compose -f docker-compose.aws.yml build recording-engine || true
docker compose -f docker-compose.aws.yml build analytics-engine || true

echo "=== 3. Starting services ==="
docker compose -f docker-compose.aws.yml up -d --remove-orphans
docker compose -f docker-compose.aws.yml up -d --force-recreate control-plane dashboard

echo "=== 4. Waiting for services to initialize ==="
sleep 5

echo "=== 5. Active Container List ==="
docker compose -f docker-compose.aws.yml ps
