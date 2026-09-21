#!/usr/bin/env bash
set -e
export DEBIAN_FRONTEND=noninteractive

echo "========================================================"
echo "🚀 Sentinel Grid (KryptoVision) GCP Production Setup"
echo "========================================================"

# Update and install Docker
echo "=== Installing prerequisites & Docker ==="
apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release git

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable docker
systemctl start docker

# Clone or pull repo
mkdir -p /opt/sentinel-grid
if [ -d "/opt/sentinel-grid/.git" ]; then
    echo "=== Updating existing repository ==="
    cd /opt/sentinel-grid
    git fetch origin main
    git reset --hard origin/main
else
    echo "=== Cloning repository ==="
    git clone https://github.com/mohananpmalavika-dev/Omsystems.git /opt/sentinel-grid
    cd /opt/sentinel-grid
fi

# Prepare environment file if not exists
cd /opt/sentinel-grid/deploy/gcp
if [ ! -f ".env" ]; then
    cat << 'EOF' > .env
NODE_ENV=production
DB_PASSWORD=SentinelGridDbMaster2026
REDIS_PASSWORD=SentinelGridRedisMaster2026
BOOTSTRAP_SUPERADMIN_PASSWORD=SentinelMasterAdmin2026!
EOF
fi

echo "=== Building and Starting GCP High-Performance Containers ==="
docker compose -f docker-compose.gcp.yml down --remove-orphans || true
docker compose -f docker-compose.gcp.yml pull postgres redis caddy || true
docker compose -f docker-compose.gcp.yml up -d postgres redis
echo "Waiting for postgres & redis to become healthy..."
sleep 10

# Run migrations
echo "=== Executing database migrations ==="
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
    docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid < "$migration" > /dev/null 2>&1 || true
    m_name=$(basename "$migration")
    docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "INSERT INTO schema_migrations (filename, checksum) VALUES ('$m_name', 'startup') ON CONFLICT (filename) DO NOTHING;" > /dev/null 2>&1 || true
done

# Download ArcFace model from GCS (too large for Git / Docker image)
ARCFACE_MODEL_DIR="/opt/sentinel-grid/analytics-engine/models/face"
ARCFACE_MODEL_PATH="$ARCFACE_MODEL_DIR/arcface_r100.onnx"
ARCFACE_GCS_URI="gs://kryptovision-installer-7866fc3f/models/arcface_r100.onnx"

mkdir -p "$ARCFACE_MODEL_DIR"
if [ ! -f "$ARCFACE_MODEL_PATH" ]; then
    echo "=== Downloading ArcFace model from GCS (~249 MB) ==="
    gsutil -q cp "$ARCFACE_GCS_URI" "$ARCFACE_MODEL_PATH" && \
        echo "✅ ArcFace model downloaded successfully." || \
        echo "⚠️  ArcFace model download failed — face recognition will be unavailable."
else
    echo "=== ArcFace model already present. Skipping download. ==="
fi

# Build and start remaining services
echo "=== Building application microservices ==="
docker compose -f docker-compose.gcp.yml build
docker compose -f docker-compose.gcp.yml up -d

echo "=== Deployment Completed Successfully! ==="
docker ps
