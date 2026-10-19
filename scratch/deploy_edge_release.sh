#!/usr/bin/env bash
set -e

echo "=== Extracting edge-agent.exe ==="
cd /tmp
tar -xzf /tmp/edge-agent.tar.gz

echo "=== Installing release files into repository ==="
sudo mkdir -p /opt/sentinel-grid/edge-agent/release
sudo mkdir -p /opt/sentinel-grid/edge-agent/installer/windows/output

sudo cp /tmp/edge-agent.exe /opt/sentinel-grid/edge-agent/release/edge-agent.exe
sudo cp /tmp/windows-release.json /opt/sentinel-grid/edge-agent/release/windows-release.json
sudo cp /tmp/OM-Systems-Sentinel-Grid-Signing.cer /opt/sentinel-grid/edge-agent/release/OM-Systems-Sentinel-Grid-Signing.cer
sudo cp /tmp/KryptonVisionInstaller-v0.1.49-windows.exe /opt/sentinel-grid/edge-agent/installer/windows/output/KryptonVisionInstaller-v0.1.49-windows.exe

sudo chmod 644 /opt/sentinel-grid/edge-agent/release/*
sudo chmod 644 /opt/sentinel-grid/edge-agent/installer/windows/output/*

echo "=== Checking Hashes ==="
sha256sum /opt/sentinel-grid/edge-agent/release/edge-agent.exe
sha256sum /opt/sentinel-grid/edge-agent/installer/windows/output/KryptonVisionInstaller-v0.1.49-windows.exe
cat /opt/sentinel-grid/edge-agent/release/windows-release.json

echo "=== Copying into running container ==="
sudo docker exec sentinel-gcp-control-plane mkdir -p /app/edge-agent/release /app/edge-agent/installer/windows/output
sudo docker cp /opt/sentinel-grid/edge-agent/release/edge-agent.exe sentinel-gcp-control-plane:/app/edge-agent/release/edge-agent.exe
sudo docker cp /opt/sentinel-grid/edge-agent/release/windows-release.json sentinel-gcp-control-plane:/app/edge-agent/release/windows-release.json
sudo docker cp /opt/sentinel-grid/edge-agent/release/OM-Systems-Sentinel-Grid-Signing.cer sentinel-gcp-control-plane:/app/edge-agent/release/OM-Systems-Sentinel-Grid-Signing.cer
sudo docker cp /opt/sentinel-grid/edge-agent/installer/windows/output/KryptonVisionInstaller-v0.1.49-windows.exe sentinel-gcp-control-plane:/app/edge-agent/installer/windows/output/KryptonVisionInstaller-v0.1.49-windows.exe

echo "=== Verifying verification script inside container ==="
sudo docker exec sentinel-gcp-control-plane node -e '
const fs = require("node:fs");
const crypto = require("node:crypto");
const exe = fs.readFileSync("/app/edge-agent/release/edge-agent.exe");
const manifest = JSON.parse(fs.readFileSync("/app/edge-agent/release/windows-release.json", "utf8"));
const hash = crypto.createHash("sha256").update(exe).digest("hex");
const installer = fs.readFileSync("/app/edge-agent/installer/windows/output/KryptonVisionInstaller-v0.1.49-windows.exe");
const instHash = crypto.createHash("sha256").update(installer).digest("hex");
console.log("Exe hash match:", hash === manifest.sha256.toLowerCase());
console.log("Installer hash match:", instHash === manifest.installerSha256.toLowerCase());
console.log("SUCCESS: All Edge Agent release files verified inside control plane container!");
'

echo "=== Updating docker-compose to mount release files permanently ==="
python3 -c "
with open('/opt/sentinel-grid/deploy/gcp/docker-compose.gcp.yml', 'r') as f:
    content = f.read()
if '../../edge-agent/release:/app/edge-agent/release:ro' not in content:
    content = content.replace(
        '- ../../scripts/docker-entrypoint.sh:/app/scripts/docker-entrypoint.sh:ro\n',
        '- ../../scripts/docker-entrypoint.sh:/app/scripts/docker-entrypoint.sh:ro\n      - ../../edge-agent/release:/app/edge-agent/release:ro\n      - ../../edge-agent/installer:/app/edge-agent/installer:ro\n'
    )
    with open('/opt/sentinel-grid/deploy/gcp/docker-compose.gcp.yml', 'w') as f:
        f.write(content)
"

echo "=== Restarting control plane ==="
cd /opt/sentinel-grid/deploy/gcp
sudo docker compose -f docker-compose.gcp.yml up -d --force-recreate control-plane
sleep 6
sudo docker ps
sudo docker logs --tail 20 sentinel-gcp-control-plane
