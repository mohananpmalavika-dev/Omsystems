#!/usr/bin/env bash
set -e
cd /opt/sentinel-grid
sudo git pull origin main
echo '{"sha256":"d3a04af1e693f5af022e391a50e536ea3422655fc6a14aab3c1842695cdc0ed2"}' | sudo tee edge-agent/release/windows-release.json
sudo bash deploy/gcp/update-live.sh
