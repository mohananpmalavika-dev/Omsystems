#!/usr/bin/env bash
set -e
sudo docker cp /tmp/control-plane-dist-patch.tar.gz sentinel-gcp-control-plane:/app/
sudo docker exec sentinel-gcp-control-plane tar -xzf /app/control-plane-dist-patch.tar.gz -C /app/
sudo docker restart sentinel-gcp-control-plane
echo "CONTROL PLANE SUCCESSFULLY UPDATED AND RESTARTED"
