#!/usr/bin/env bash
set -e

echo "========================================================"
echo "🚀 Sentinel Grid Live In-Place Updater"
echo "========================================================"

cd /opt/sentinel-grid
RELEASE_MANIFEST_BACKUP=""
if [ -s /opt/sentinel-grid/edge-agent/release/edge-agent.exe ] && [ -s /opt/sentinel-grid/edge-agent/release/windows-release.json ]; then
  # Release artifacts are delivered outside Git. Keep the manifest that was
  # checksum-verified with the executable; `git reset --hard` below would
  # otherwise replace it with the repository placeholder before Docker builds.
  RELEASE_MANIFEST_BACKUP=$(mktemp /tmp/sentinel-windows-release-manifest.XXXXXXXXXX)
  cp /opt/sentinel-grid/edge-agent/release/windows-release.json "$RELEASE_MANIFEST_BACKUP"
fi
echo "--> Fetching latest updates from GitHub..."
git fetch origin main
git reset --hard origin/main

if [ -n "$RELEASE_MANIFEST_BACKUP" ]; then
  install -d /opt/sentinel-grid/edge-agent/release
  install -m 0644 "$RELEASE_MANIFEST_BACKUP" /opt/sentinel-grid/edge-agent/release/windows-release.json
  rm -f "$RELEASE_MANIFEST_BACKUP"
fi

mkdir -p /opt/sentinel-grid/edge-agent/release
if [ ! -s /opt/sentinel-grid/edge-agent/release/edge-agent.exe ]; then
  echo "--> Ensuring edge-agent binary presence..."
  if ! docker cp sentinel-gcp-control-plane:/app/edge-agent/release/edge-agent.exe /opt/sentinel-grid/edge-agent/release/edge-agent.exe; then
    echo "No Windows release is available. Upload the signed release with deploy/gcp/update-edge-release.sh before retrying. The running containers have not been replaced." >&2
    exit 1
  fi
fi

if [ -s /opt/sentinel-grid/edge-agent/release/edge-agent.exe ]; then
  echo "--> Ensuring pre-deflated edge agent cache..."
  if command -v node >/dev/null 2>&1; then
    node /opt/sentinel-grid/edge-agent/scripts/cache-deflated.mjs /opt/sentinel-grid/edge-agent/release || true
  fi
fi

cd /opt/sentinel-grid/deploy/gcp
echo "--> Building control-plane and dashboard images..."
docker compose -f docker-compose.gcp.yml build control-plane dashboard

echo "--> Recreating containers..."
docker compose -f docker-compose.gcp.yml up -d --force-recreate caddy control-plane dashboard

# Update media-gateway configuration (low-latency HLS)
if [ -f /opt/sentinel-grid/media-gateway/mediamtx.yml ]; then
  echo "--> Updating media-gateway mediamtx.yml..."
  docker cp /opt/sentinel-grid/media-gateway/mediamtx.yml sentinel-gcp-media-gateway:/app/media-gateway/mediamtx.yml || true
  docker restart sentinel-gcp-media-gateway || true
fi

# Apply hotfixes/patches to analytics-engine if needed
if [ -f /opt/sentinel-grid/scratch/patch_analytics.cjs ]; then
  echo "--> Patching analytics-engine in-container..."
  docker cp /opt/sentinel-grid/scratch/patch_analytics.cjs sentinel-gcp-analytics-engine:/tmp/patch_analytics.cjs || true
  docker exec sentinel-gcp-analytics-engine node /tmp/patch_analytics.cjs || true
  docker restart sentinel-gcp-analytics-engine || true
fi

echo "========================================================"
echo "✅ Update complete! Sentinel Grid is running latest code."
echo "========================================================"
