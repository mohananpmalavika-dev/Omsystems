#!/usr/bin/env bash
set -euo pipefail
version=0.1.42
root=/opt/sentinel-grid/edge-agent/release/updates/$version
sudo mkdir -p "$root"
if [ -e "$root/edge-agent.bundle" ]; then
  cmp /tmp/edge-agent.bundle "$root/edge-agent.bundle"
else
  sudo install -m 0644 /tmp/edge-agent.bundle "$root/edge-agent.bundle"
  sudo install -m 0644 /tmp/manifest.json "$root/manifest.json"
fi
sudo docker exec sentinel-gcp-control-plane sh -c 'pwd; ls -d /app/edge-agent /app/packages/edge-agent 2>/dev/null || true'
sudo docker inspect sentinel-gcp-control-plane --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}'
