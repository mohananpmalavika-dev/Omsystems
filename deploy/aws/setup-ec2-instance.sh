#!/usr/bin/env bash
# ==============================================================================
# Sentinel Grid (Om Systems) - Standalone EC2 Bootstrap & Installation Script
# Supports: Amazon Linux 2023, Ubuntu 22.04 / 24.04 LTS, Debian 12
# ==============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}=====================================================${NC}"
echo -e "${CYAN}   🚀 Sentinel Grid (Om Systems) - AWS EC2 Installer ${NC}"
echo -e "${CYAN}=====================================================${NC}"

if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}❌ This script must be run as root (e.g. sudo bash setup-ec2-instance.sh)${NC}"
   exit 1
fi

echo -e "\n${YELLOW}📦 Step 1: Installing System Dependencies...${NC}"

if command -v dnf &> /dev/null; then
    # Amazon Linux 2023 / RHEL / Fedora
    dnf update -y
    dnf install -y docker git curl wget jq openssl
    systemctl start docker
    systemctl enable docker
    usermod -aG docker ec2-user || true
elif command -v apt-get &> /dev/null; then
    # Ubuntu / Debian
    apt-get update -y
    apt-get install -y docker.io docker-compose-plugin git curl wget jq openssl
    systemctl start docker
    systemctl enable docker
    usermod -aG docker ubuntu || true
fi

# Ensure Docker Compose plugin is present
DOCKER_PLUGIN_DIR="/usr/local/lib/docker/cli-plugins"
mkdir -p "$DOCKER_PLUGIN_DIR"
if ! command -v docker-compose &> /dev/null && [ ! -f "$DOCKER_PLUGIN_DIR/docker-compose" ]; then
    echo -e "${YELLOW}📥 Downloading Docker Compose plugin...${NC}"
    curl -SL https://github.com/docker/compose/releases/download/v2.29.2/docker-compose-linux-x86_64 -o "$DOCKER_PLUGIN_DIR/docker-compose"
    chmod +x "$DOCKER_PLUGIN_DIR/docker-compose"
    ln -sf "$DOCKER_PLUGIN_DIR/docker-compose" /usr/bin/docker-compose || true
fi

APP_DIR="/opt/sentinel-grid"
mkdir -p "$APP_DIR"
echo -e "${GREEN}✅ Base system configured.${NC}"

echo -e "\n${YELLOW}🔑 Step 2: Generating Cryptographic Secrets & Environment...${NC}"

JWT_SECRET=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)
MEDIA_KEY=$(openssl rand -hex 24)
REC_KEY=$(openssl rand -hex 24)
ANALYTICS_KEY=$(openssl rand -hex 24)
ANALYTICS_SRC_KEY=$(openssl rand -hex 24)
REPORT_SECRET=$(openssl rand -hex 24)
DB_PASS=$(openssl rand -hex 20)
REDIS_PASS=$(openssl rand -hex 20)

PUBLIC_IP=$(curl -s http://checkip.amazonaws.com || curl -s https://ifconfig.me || echo "127.0.0.1")

if [ ! -f "$APP_DIR/.env" ]; then
    cat <<EOF > "$APP_DIR/.env"
NODE_ENV=production
PORT=8080
HOST=0.0.0.0
DB_PASSWORD=$DB_PASS
REDIS_PASSWORD=$REDIS_PASS
DATABASE_URL=postgresql://sentinel_admin:$DB_PASS@postgres:5432/sentinel_grid
REDIS_URL=redis://:$REDIS_PASS@redis:6379
JWT_SECRET=$JWT_SECRET
SESSION_SECRET=$SESSION_SECRET
MEDIA_GATEWAY_SHARED_KEY=$MEDIA_KEY
RECORDING_ENGINE_SHARED_KEY=$REC_KEY
ANALYTICS_ENGINE_SHARED_KEY=$ANALYTICS_KEY
ANALYTICS_SOURCE_SHARED_KEY=$ANALYTICS_SRC_KEY
REPORT_DOWNLOAD_SECRET=$REPORT_SECRET
CONTROL_PLANE_PUBLIC_URL=http://$PUBLIC_IP:8080
DOMAIN_NAME=
ADMIN_EMAIL=admin@example.com
EOF
    echo -e "${GREEN}✅ Generated fresh production credentials in $APP_DIR/.env${NC}"
else
    echo -e "${CYAN}ℹ️ Existing .env file found at $APP_DIR/.env (skipping overwrite).${NC}"
fi

echo -e "\n${YELLOW}⚙️ Step 3: Registering Sentinel Grid systemd Service...${NC}"

cat <<'EOF' > /etc/systemd/system/sentinel-grid.service
[Unit]
Description=Sentinel Grid Surveillance & AI Analytics Platform
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/sentinel-grid
ExecStart=/usr/bin/docker compose -f deploy/aws/docker-compose.aws.yml up -d
ExecStop=/usr/bin/docker compose -f deploy/aws/docker-compose.aws.yml down

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable sentinel-grid

echo -e "\n${GREEN}=====================================================${NC}"
echo -e "${GREEN}  🎉 EC2 Instance Prepared Successfully!            ${NC}"
echo -e "${GREEN}=====================================================${NC}"
echo -e "To start Sentinel Grid manually:"
echo -e "  cd $APP_DIR"
echo -e "  docker compose -f deploy/aws/docker-compose.aws.yml up -d --build"
echo -e ""
echo -e "Public URLs once started:"
echo -e "  - Dashboard UI:       ${CYAN}http://$PUBLIC_IP:10000${NC} (or http://$PUBLIC_IP via Caddy)"
echo -e "  - Control Plane API:  ${CYAN}http://$PUBLIC_IP:8080/ready${NC}"
echo -e "  - Live HLS Stream:    ${CYAN}http://$PUBLIC_IP:8888${NC}"
echo -e "====================================================="
