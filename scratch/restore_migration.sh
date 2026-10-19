#!/usr/bin/env bash
set -e

echo "=== 1. Deploying ArcFace AI Model ==="
sudo mkdir -p /opt/sentinel-grid/analytics-engine/models/face
sudo cp /tmp/arcface_r100.onnx /opt/sentinel-grid/analytics-engine/models/face/arcface_r100.onnx
sudo chmod 644 /opt/sentinel-grid/analytics-engine/models/face/arcface_r100.onnx

echo "=== 2. Stopping API services during DB restore ==="
cd /opt/sentinel-grid/deploy/gcp
sudo docker compose -f docker-compose.gcp.yml stop control-plane dashboard recording-engine analytics-engine

echo "=== 3. Copying dump into Postgres container ==="
sudo docker cp /tmp/sentinel_grid_backup.dump sentinel-gcp-postgres:/tmp/sentinel_grid_backup.dump

echo "=== 4. Recreating database ==="
sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'sentinel_grid' AND pid <> pg_backend_pid();"
sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d postgres -c "DROP DATABASE IF EXISTS sentinel_grid;"
sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d postgres -c "CREATE DATABASE sentinel_grid;"

echo "=== 5. Restoring 5.7 GB database with 4 parallel workers ==="
sudo docker exec sentinel-gcp-postgres pg_restore -U sentinel_admin -d sentinel_grid -j 4 --no-owner --no-privileges /tmp/sentinel_grid_backup.dump || true

echo "=== 6. Restarting all services ==="
sudo docker compose -f docker-compose.gcp.yml up -d
sleep 8

echo "=== 7. Verifying migrated database counts ==="
sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "SELECT count(*) AS total_cameras FROM cameras;"
sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "SELECT count(*) AS total_resource_nodes FROM resource_nodes;"
sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "SELECT id, username, email, role, active FROM users;"

echo "=== 8. Checking service status ==="
sudo docker ps
