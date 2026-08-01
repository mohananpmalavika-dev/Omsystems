#!/bin/bash
# Sentinel Grid Edge Agent - Linux Installer
# One-click installation script for branch deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="/opt/sentinel-grid/edge-agent"
SERVICE_NAME="sentinel-grid-edge-agent"
CONTROL_PLANE_URL="https://sentinel-grid-control-plane1.onrender.com"
BRANCH_ID="00000000-0000-4000-8000-000000000104"
BRIDGE_KEY="WBRrQzol9gGTuIEAVd08kvMFP5pfyNDj1m32qZ7YsShOcxHa"

echo ""
echo "======================================"
echo "  Sentinel Grid Edge Agent Installer"
echo "======================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ Please run as root (use sudo)${NC}"
    echo ""
    echo "Usage: sudo ./install.sh"
    exit 1
fi

# Get branch name
echo -e "${YELLOW}Enter branch name:${NC}"
read -p "> " BRANCH_NAME

if [ -z "$BRANCH_NAME" ]; then
    echo -e "${RED}❌ Branch name cannot be empty${NC}"
    exit 1
fi

# Optional activation code
echo ""
echo -e "${YELLOW}Activation code (optional, press Enter to skip):${NC}"
read -p "> " ACTIVATION_CODE

echo ""
echo "======================================"
echo "  Installing..."
echo "======================================"
echo ""

# Detect OS
echo "Detecting operating system..."
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VER=$VERSION_ID
    echo "✅ Detected: $PRETTY_NAME"
else
    echo -e "${RED}❌ Cannot detect OS${NC}"
    exit 1
fi

# Install dependencies
echo ""
echo "Installing dependencies..."

if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
    apt-get update
    apt-get install -y curl wget nodejs npm ffmpeg
elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ]; then
    yum install -y curl wget nodejs npm ffmpeg
elif [ "$OS" = "fedora" ]; then
    dnf install -y curl wget nodejs npm ffmpeg
else
    echo -e "${YELLOW}⚠️  Unknown OS, attempting to continue...${NC}"
fi

echo "✅ Dependencies installed"

# Create installation directory
echo ""
echo "Creating installation directory..."
mkdir -p "$INSTALL_DIR"/{config,data,logs,runtime,vendor}

# Download/copy edge agent (placeholder - in real deployment, you'd download from your server)
echo ""
echo "Installing edge agent..."
# In a real installer, this would download from your distribution server:
# curl -L https://releases.sentinel-grid.com/edge-agent-linux-x64 -o "$INSTALL_DIR/edge-agent"

# For now, check if edge-agent binary exists
if [ ! -f "./edge-agent" ]; then
    echo -e "${RED}❌ Edge agent binary not found${NC}"
    echo "Please provide the edge-agent executable in the same directory"
    exit 1
fi

cp edge-agent "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/edge-agent"

echo "✅ Edge agent installed"

# Register with cloud
echo ""
echo "Registering with Sentinel Grid Cloud..."

REGISTRATION_DATA=$(cat <<EOF
{
  "branchId": "$BRANCH_ID",
  "name": "$BRANCH_NAME",
  "version": "0.1.0"
}
EOF
)

EDGE_AGENT_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)

echo "✅ Generated Edge Agent ID: $EDGE_AGENT_ID"

# Generate media key
MEDIA_KEY="sentinel-grid-edge-$(cat /proc/sys/kernel/random/uuid | tr -d '-')"

# Create configuration
echo ""
echo "Creating configuration..."

cat > "$INSTALL_DIR/config/edge-agent.env" <<EOF
# Sentinel Grid Edge Agent Configuration
# Branch: $BRANCH_NAME
# Generated: $(date)

# Control Plane Connection
CONTROL_PLANE_URL="$CONTROL_PLANE_URL"
EDGE_BRIDGE_SHARED_KEY="$BRIDGE_KEY"
EDGE_AGENT_ID="$EDGE_AGENT_ID"
EDGE_AGENT_NAME="$BRANCH_NAME"
EDGE_AGENT_VERSION="0.1.0"
BRANCH_ID="$BRANCH_ID"
DEV_USER_ID="user-global-admin"

# Logging
LOG_LEVEL="info"
DATA_DIRECTORY="$INSTALL_DIR/data"
LOG_DIRECTORY="$INSTALL_DIR/logs"
EDGE_LOG_PATH="$INSTALL_DIR/logs/edge-agent.log"

# Camera Discovery
CAMERA_DISCOVERY_ENABLED="true"
CAMERA_DISCOVERY_INTERVAL_SECONDS="60"
DISCOVERY_TIMEOUT_MS="5000"
ONVIF_TIMEOUT_MS="8000"
ONVIF_ENDPOINTS=""

# Camera Credentials
CAMERA_USERNAME="admin"
CAMERA_PASSWORD="admin"

# Live Media Streaming
LIVE_MEDIA_ENABLED="true"
HEARTBEAT_INTERVAL_SECONDS="30"
EDGE_MEDIA_SHARED_KEY="$MEDIA_KEY"
STREAM_SECRET_STORE_PATH="$INSTALL_DIR/data/stream-secrets.json"
STREAM_SECRET_PROVIDER_HOST="127.0.0.1"
STREAM_SECRET_PROVIDER_PORT="8093"
EDGE_LIVE_GATEWAY_HOST="127.0.0.1"
EDGE_LIVE_GATEWAY_PORT="8090"
PUBLIC_MEDIA_GATEWAY_URL="http://127.0.0.1:8090"

# Media Server
MEDIAMTX_PATH="mediamtx"
MEDIAMTX_API_URL="http://127.0.0.1:9997"
MEDIAMTX_HLS_URL="http://127.0.0.1:8888"

# Tunnel
MEDIA_TUNNEL_MODE="disabled"
CLOUDFLARED_PATH="cloudflared"
MEDIA_ACCESS_TTL_SECONDS="300"

# FFmpeg
FFPROBE_PATH="ffprobe"
FFMPEG_PATH="ffmpeg"

# Monitoring
CAMERA_HEARTBEAT_INTERVAL_MS="30000"
CAMERA_CONFIG_REFRESH_MS="60000"
CONTROL_PLANE_TIMEOUT_MS="15000"

# Health
EDGE_HEALTH_DISK_PATH="$INSTALL_DIR"
EOF

echo "✅ Configuration created"

# Create systemd service
echo ""
echo "Installing systemd service..."

cat > "/etc/systemd/system/$SERVICE_NAME.service" <<EOF
[Unit]
Description=Sentinel Grid Edge Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
Environment="NODE_ENV=production"
ExecStart=$INSTALL_DIR/edge-agent --config $INSTALL_DIR/config/edge-agent.env
Restart=always
RestartSec=10
StandardOutput=append:$INSTALL_DIR/logs/stdout.log
StandardError=append:$INSTALL_DIR/logs/stderr.log

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd
systemctl daemon-reload

# Enable service
systemctl enable $SERVICE_NAME

echo "✅ Service installed"

# Start service
echo ""
echo "Starting service..."
systemctl start $SERVICE_NAME

# Check status
sleep 2
if systemctl is-active --quiet $SERVICE_NAME; then
    echo -e "${GREEN}✅ Service started successfully${NC}"
else
    echo -e "${YELLOW}⚠️  Service installed but not running${NC}"
    echo "Check logs: journalctl -u $SERVICE_NAME -f"
fi

echo ""
echo "======================================"
echo "  Installation Complete!"
echo "======================================"
echo ""
echo "Branch: $BRANCH_NAME"
echo "Status: $(systemctl is-active $SERVICE_NAME)"
echo ""
echo "View your branch in the dashboard at:"
echo "https://sentinel-grid-monitoring1.omrender.com/admin"
echo ""
echo "Useful commands:"
echo "  Status:  systemctl status $SERVICE_NAME"
echo "  Logs:    journalctl -u $SERVICE_NAME -f"
echo "  Stop:    systemctl stop $SERVICE_NAME"
echo "  Start:   systemctl start $SERVICE_NAME"
echo "  Restart: systemctl restart $SERVICE_NAME"
echo ""
echo "Configuration: $INSTALL_DIR/config/edge-agent.env"
echo "Logs: $INSTALL_DIR/logs/"
echo ""
