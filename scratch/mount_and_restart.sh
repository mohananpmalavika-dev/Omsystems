#!/usr/bin/env bash
set -e

# Update docker-compose to mount the fixed entrypoint
python3 -c "
with open('/opt/sentinel-grid/deploy/gcp/docker-compose.gcp.yml', 'r') as f:
    content = f.read()
target = 'container_name: sentinel-gcp-control-plane\n'
replacement = 'container_name: sentinel-gcp-control-plane\n    volumes:\n      - ../../scripts/docker-entrypoint.sh:/app/scripts/docker-entrypoint.sh:ro\n'
if 'scripts/docker-entrypoint.sh' not in content:
    content = content.replace(target, replacement, 1)
    with open('/opt/sentinel-grid/deploy/gcp/docker-compose.gcp.yml', 'w') as f:
        f.write(content)
"

# Copy the fixed entrypoint script
cp /tmp/docker-entrypoint.sh /opt/sentinel-grid/scripts/docker-entrypoint.sh
chmod +x /opt/sentinel-grid/scripts/docker-entrypoint.sh

# Recreate control-plane
cd /opt/sentinel-grid/deploy/gcp
docker compose -f docker-compose.gcp.yml up -d --force-recreate control-plane
sleep 6
docker ps
echo "=== LOGS ==="
docker logs --tail 30 sentinel-gcp-control-plane
