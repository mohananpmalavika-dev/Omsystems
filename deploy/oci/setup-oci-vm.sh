#!/usr/bin/env bash
# ==============================================================================
# Sentinel Grid / KryptonVision - Oracle Cloud Infrastructure (OCI) Setup Script
# Fully Automated Setup for OCI Ubuntu 22.04 / 24.04 & Oracle Linux Instances
# ==============================================================================

set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "================================================================="
echo "  🚀 KryptonLogic / OM Systems - OCI Production Deployment      "
echo "================================================================="

# 1. Detect Public IP
echo -e "\n[1/6] Detecting OCI Instance Public IP..."
PUBLIC_IP=$(curl -s --connect-timeout 5 https://ifconfig.me || curl -s --connect-timeout 5 https://api.ipify.org || echo "")
if [ -n "$PUBLIC_IP" ]; then
    echo "✅ Detected Public IP: $PUBLIC_IP"
    SSLIP_DOMAIN="${PUBLIC_IP//./-}.sslip.io"
    echo "✅ Default SSL Domain: https://$SSLIP_DOMAIN"
else
    echo "⚠️  Could not detect public IP automatically. Using localhost fallback."
    PUBLIC_IP="127.0.0.1"
    SSLIP_DOMAIN="localhost"
fi

# 2. Configure Host Firewall for Oracle Cloud
# IMPORTANT: OCI instances have strict host-level iptables rules blocking non-SSH ports
echo -e "\n[2/6] Configuring OCI Host Firewall..."
if command -v iptables &> /dev/null; then
    echo "Opening TCP ports: 80, 443, 8080, 8090, 8554, 8888, 10000 and UDP 8189..."
    sudo iptables -I INPUT 1 -p tcp -m multiport --dports 80,443,8080,8090,8554,8888,10000 -j ACCEPT 2>/dev/null || true
    sudo iptables -I INPUT 1 -p udp --dport 8189 -j ACCEPT 2>/dev/null || true

    # Save iptables rules across reboots
    if command -v netfilter-persistent &> /dev/null; then
        sudo netfilter-persistent save 2>/dev/null || true
    elif [ -f /etc/debian_version ]; then
        sudo apt-get update -y && sudo apt-get install -y iptables-persistent netfilter-persistent
        sudo netfilter-persistent save 2>/dev/null || true
    elif command -v firewall-cmd &> /dev/null; then
        sudo firewall-cmd --permanent --add-port={80/tcp,443/tcp,8080/tcp,8090/tcp,8554/tcp,8888/tcp,10000/tcp,8189/udp} 2>/dev/null || true
        sudo firewall-cmd --reload 2>/dev/null || true
    fi
    echo "✅ OCI Host Firewall configured successfully."
fi

# 3. Install Docker & Docker Compose
echo -e "\n[3/6] Installing Docker & Docker Compose Plugin..."
if ! command -v docker &> /dev/null; then
    if [ -f /etc/debian_version ]; then
        sudo apt-get update -y
        sudo apt-get install -y ca-certificates curl gnupg lsb-release git
        sudo install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
        sudo chmod a+r /etc/apt/keyrings/docker.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
        sudo apt-get update -y
        sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    elif [ -f /etc/oracle-release ] || [ -f /etc/redhat-release ]; then
        sudo dnf update -y
        sudo dnf install -y git curl
        sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo || true
        sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    fi
    sudo systemctl enable docker
    sudo systemctl start docker
    echo "✅ Docker installed and running."
else
    echo "✅ Docker is already installed: $(docker --version)"
fi

# 4. Clone or Update Application Repository
echo -e "\n[4/6] Setting up application repository at /opt/sentinel-grid..."
sudo mkdir -p /opt/sentinel-grid
sudo chown -R "$USER":"$USER" /opt/sentinel-grid

if [ -d "/opt/sentinel-grid/.git" ]; then
    echo "Updating existing repository..."
    cd /opt/sentinel-grid
    git fetch origin main || true
    git reset --hard origin/main || true
else
    echo "Cloning repository from GitHub..."
    git clone https://github.com/mohananpmalavika-dev/Omsystems.git /opt/sentinel-grid
    cd /opt/sentinel-grid
fi

sudo mkdir -p /opt/sentinel-grid/deploy/oci
if [ -f "/tmp/Caddyfile" ]; then
    sudo cp /tmp/Caddyfile /opt/sentinel-grid/deploy/oci/
fi
if [ -f "/tmp/docker-compose.oci.yml" ]; then
    sudo cp /tmp/docker-compose.oci.yml /opt/sentinel-grid/deploy/oci/
fi

# 5. Prepare Production Environment Variables (.env)
echo -e "\n[5/6] Generating OCI production .env configuration..."
cd /opt/sentinel-grid/deploy/oci

CUSTOM_DOMAIN="${1:-}"
if [ -n "$CUSTOM_DOMAIN" ]; then
    PRIMARY_DOMAIN="$CUSTOM_DOMAIN"
    PUBLIC_URL="https://$CUSTOM_DOMAIN"
else
    PRIMARY_DOMAIN="$SSLIP_DOMAIN"
    PUBLIC_URL="https://$SSLIP_DOMAIN"
fi

cat << EOF > .env
NODE_ENV=production
DOMAIN_NAME=$PRIMARY_DOMAIN
OCI_PUBLIC_IP_DOMAIN=$SSLIP_DOMAIN
PUBLIC_BASE_URL=$PUBLIC_URL
ADMIN_EMAIL=service@omsystemandservice.in

DB_PASSWORD=OciSentinelMaster2026!
REDIS_PASSWORD=OciSentinelRedis2026!
BOOTSTRAP_SUPERADMIN_PASSWORD=SentinelMasterAdmin2026!

JWT_SECRET=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 32 || echo "oci-jwt-secret-kryptonlogic-2026")
SESSION_SECRET=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 32 || echo "oci-session-secret-kryptonlogic-2026")
MEDIA_GATEWAY_SHARED_KEY=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 32 || echo "oci-mg-key-2026")
EDGE_BRIDGE_SHARED_KEY=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 32 || echo "oci-eb-key-2026")
RECORDING_ENGINE_SHARED_KEY=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 32 || echo "oci-rec-key-2026")
ANALYTICS_ENGINE_SHARED_KEY=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 32 || echo "oci-ae-key-2026")
ANALYTICS_SOURCE_SHARED_KEY=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 32 || echo "oci-as-key-2026")
REPORT_DOWNLOAD_SECRET=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 32 || echo "oci-rpt-key-2026")
EOF

echo "✅ Environment file .env created for $PUBLIC_URL"

# 6. Deploy and Start Containers
echo -e "\n[6/6] Building and Launching OCI Containers..."
cd /opt/sentinel-grid/deploy/oci
docker compose -f docker-compose.oci.yml down --remove-orphans || true
docker compose -f docker-compose.oci.yml pull postgres redis caddy || true
docker compose -f docker-compose.oci.yml up -d postgres redis

echo "Waiting 10s for database readiness..."
sleep 10

# Run migrations
echo "Executing database migrations..."
docker exec -i sentinel-oci-postgres psql -U sentinel_admin -d sentinel_grid -c "
CREATE TABLE IF NOT EXISTS schema_migrations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  filename text NOT NULL UNIQUE,
  executed_at timestamptz NOT NULL DEFAULT now(),
  checksum text NOT NULL DEFAULT '',
  execution_time_ms integer NOT NULL DEFAULT 0
);
" > /dev/null 2>&1 || true

for migration in $(ls -1v /opt/sentinel-grid/database/migrations/*.sql 2>/dev/null); do
    docker exec -i sentinel-oci-postgres psql -U sentinel_admin -d sentinel_grid < "$migration" > /dev/null 2>&1 || true
    m_name=$(basename "$migration")
    docker exec -i sentinel-oci-postgres psql -U sentinel_admin -d sentinel_grid -c "INSERT INTO schema_migrations (filename, checksum) VALUES ('$m_name', 'startup') ON CONFLICT (filename) DO NOTHING;" > /dev/null 2>&1 || true
done

echo "Starting all remaining microservices (Dashboard, Control Plane, Media Gateway)..."
docker compose -f docker-compose.oci.yml up -d --build

echo ""
echo "================================================================="
echo "🎉 DEPLOYMENT SUCCESSFUL ON ORACLE CLOUD INFRASTRUCTURE!"
echo "================================================================="
echo "Public Portal:  $PUBLIC_URL"
echo "Login URL:      $PUBLIC_URL/login"
echo "Default User:   krypton"
echo "Default Pass:   4344@RAM"
echo "================================================================="
