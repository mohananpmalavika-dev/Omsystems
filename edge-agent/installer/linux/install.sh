#!/usr/bin/env bash
# Sentinel Grid zero-touch Linux gateway installer.
set -euo pipefail

INSTALL_DIR="${SENTINEL_INSTALL_DIR:-/opt/sentinel-grid/edge-agent}"
SERVICE_NAME="sentinel-grid-edge-agent"
CONTROL_PLANE_URL="${SENTINEL_CONTROL_PLANE_URL:-https://sentinel-grid-control-plane1.onrender.com}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this installer with sudo."
  exit 1
fi
if [[ ! -x "${SCRIPT_DIR}/edge-agent" ]]; then
  echo "Place the packaged edge-agent executable beside install.sh."
  exit 1
fi
for runtime_binary in mediamtx cloudflared; do
  if [[ ! -x "${SCRIPT_DIR}/${runtime_binary}" ]]; then
    echo "The all-in-one gateway package is incomplete: ${runtime_binary} is missing beside install.sh."
    exit 1
  fi
done

read -r -p "Branch display name: " BRANCH_NAME
read -r -s -p "One-time activation code from Sentinel Grid: " ACTIVATION_CODE
echo
if [[ -z "${BRANCH_NAME}" || "${ACTIVATION_CODE}" != sgact_* || ${#ACTIVATION_CODE} -lt 40 ]]; then
  echo "A branch name and valid sgact_ activation code are required."
  exit 1
fi

if command -v apt-get >/dev/null 2>&1; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates ffmpeg
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y ca-certificates ffmpeg
elif command -v yum >/dev/null 2>&1; then
  yum install -y ca-certificates ffmpeg
fi

install -d -m 0700 "${INSTALL_DIR}/config" "${INSTALL_DIR}/data" "${INSTALL_DIR}/logs"
install -m 0755 "${SCRIPT_DIR}/edge-agent" "${INSTALL_DIR}/edge-agent"
install -m 0755 "${SCRIPT_DIR}/mediamtx" "${INSTALL_DIR}/mediamtx"
install -m 0755 "${SCRIPT_DIR}/cloudflared" "${INSTALL_DIR}/cloudflared"

cat > "${INSTALL_DIR}/config/edge-agent.env" <<EOF
CONTROL_PLANE_URL="${CONTROL_PLANE_URL}"
BRANCH_ID=""
EDGE_AGENT_ID=""
EDGE_BRIDGE_SHARED_KEY=""
DEV_USER_ID=""
EDGE_ACTIVATION_CODE="${ACTIVATION_CODE}"
EDGE_AGENT_NAME="${BRANCH_NAME}"
EDGE_AGENT_VERSION="0.1.7"
EDGE_IDENTITY_PATH="${INSTALL_DIR}/data/device-identity.enc"
EDGE_IDENTITY_KEY_PATH="${INSTALL_DIR}/data/device-identity.key"
EDGE_OFFLINE_OUTBOX_PATH="${INSTALL_DIR}/data/offline-outbox.enc"
EDGE_OFFLINE_OUTBOX_KEY_PATH="${INSTALL_DIR}/data/offline-outbox.key"
EDGE_OFFLINE_OUTBOX_MAX_ITEMS="10000"
EDGE_CAMERA_CREDENTIAL_VAULT_PATH="${INSTALL_DIR}/data/camera-credentials.enc"
EDGE_CAMERA_CREDENTIAL_VAULT_KEY_PATH="${INSTALL_DIR}/data/camera-credentials.key"
EDGE_UPDATE_STAGING_PATH="${INSTALL_DIR}/data/updates"
EDGE_LOG_PATH="${INSTALL_DIR}/logs/edge-agent.log"
CAMERA_USERNAME=""
CAMERA_PASSWORD=""
ONVIF_ENDPOINTS=""
AUTO_DISCOVERY_ENABLED="true"
AUTO_DISCOVERY_INTERVAL_MS="900000"
DISCOVERY_TIMEOUT_MS="8000"
ONVIF_TIMEOUT_MS="10000"
FFPROBE_PATH="ffprobe"
FFMPEG_PATH="ffmpeg"
LIVE_MEDIA_ENABLED="true"
EDGE_MANAGED_MEDIA_BOOTSTRAP="true"
EDGE_LIVE_GATEWAY_HOST="0.0.0.0"
EDGE_LIVE_GATEWAY_PORT="8090"
PUBLIC_MEDIA_GATEWAY_URL="auto"
MEDIA_RUNTIME_MANAGED="true"
MEDIAMTX_PATH="${INSTALL_DIR}/mediamtx"
MEDIA_TUNNEL_MODE="quick"
MEDIA_QUICK_TUNNEL_FALLBACK="false"
CLOUDFLARED_PATH="${INSTALL_DIR}/cloudflared"
STREAM_SECRET_STORE_PATH="${INSTALL_DIR}/data/stream-secrets.json"
CAMERA_HEARTBEAT_INTERVAL_MS="30000"
CAMERA_CONFIG_REFRESH_MS="60000"
CONTROL_PLANE_TIMEOUT_MS="30000"
INTERNET_LINKS_JSON="[]"
RECORDERS_JSON="[]"
RECORDER_POLL_INTERVAL_MS="30000"
RECORDER_ARCHIVE_SCAN_INTERVAL_MS="21600000"
EDGE_HEALTH_DISK_PATH="${INSTALL_DIR}"
EOF
chmod 0600 "${INSTALL_DIR}/config/edge-agent.env"

cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Sentinel Grid Branch Gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/edge-agent --config ${INSTALL_DIR}/config/edge-agent.env
Restart=always
RestartSec=10
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=${INSTALL_DIR}
StandardOutput=append:${INSTALL_DIR}/logs/stdout.log
StandardError=append:${INSTALL_DIR}/logs/stderr.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}"
echo "Sentinel Grid gateway installed. Check: systemctl status ${SERVICE_NAME}"
