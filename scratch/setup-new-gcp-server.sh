#!/usr/bin/env bash
set -e

echo "========================================================"
echo "🚀 Sentinel Grid Setup on New GCP Server (35.200.130.81)"
echo "========================================================"

cd /opt/sentinel-grid/deploy/gcp

# 1. Prepare production .env
cat << 'EOF' > .env
NODE_ENV=production
DOMAIN_NAME=35-200-130-81.sslip.io
CONTROL_PLANE_PUBLIC_URL=https://35-200-130-81.sslip.io
PUBLIC_DASHBOARD_URL=https://35-200-130-81.sslip.io
PUBLIC_HLS_BASE_URL=https://35-200-130-81.sslip.io/hls
PUBLIC_WEBRTC_BASE_URL=https://35-200-130-81.sslip.io/webrtc
ADMIN_EMAIL=aditimalavika9@gmail.com
DB_PASSWORD=SentinelGridDbMaster2026
REDIS_PASSWORD=SentinelGridRedisMaster2026
BOOTSTRAP_SUPERADMIN_PASSWORD=SentinelMasterAdmin2026!
MEDIA_GATEWAY_SHARED_KEY=development-media-gateway-key-32charsmin
REPORT_DOWNLOAD_SECRET=development-report-download-secret-32charsmin
EOF

# 2. Update Caddyfile with new IP & sslip.io domain
sed -i 's/34\.14\.220\.41/35.200.130.81/g' Caddyfile
sed -i 's/35-200-130-81/35-200-130-81/g' Caddyfile
sed -i 's/mohanpmalavika@gmail.com/aditimalavika9@gmail.com/g' Caddyfile

# 3. Pull base images and start database & cache
echo "=== Starting PostgreSQL & Redis ==="
docker compose -f docker-compose.gcp.yml pull postgres redis caddy || true
docker compose -f docker-compose.gcp.yml up -d postgres redis

echo "Waiting for postgres to become healthy..."
until docker exec sentinel-gcp-postgres pg_isready -U sentinel_admin -d sentinel_grid; do
  sleep 2
done
echo "✅ PostgreSQL is healthy!"

# 4. Run database migrations
echo "=== Running Database Migrations ==="
docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "
CREATE TABLE IF NOT EXISTS schema_migrations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  filename text NOT NULL UNIQUE,
  executed_at timestamptz NOT NULL DEFAULT now(),
  checksum text NOT NULL DEFAULT '',
  execution_time_ms integer NOT NULL DEFAULT 0
);
" > /dev/null 2>&1 || true

for migration in $(ls -1v /opt/sentinel-grid/database/migrations/*.sql 2>/dev/null); do
  echo "Applying migration: $(basename "$migration")"
  docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid < "$migration" > /dev/null 2>&1 || true
  m_name=$(basename "$migration")
  docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "INSERT INTO schema_migrations (filename, checksum) VALUES ('$m_name', 'startup') ON CONFLICT (filename) DO NOTHING;" > /dev/null 2>&1 || true
done
echo "✅ Migrations completed!"

# 5. Build and launch all microservices
echo "=== Building and Starting Application Services ==="
docker compose -f docker-compose.gcp.yml build
docker compose -f docker-compose.gcp.yml up -d

echo "=== Current Running Containers ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo "========================================================"
echo "🎉 Sentinel Grid Server Setup Complete on 35.200.130.81!"
echo "========================================================"
