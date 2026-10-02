#!/usr/bin/env bash
set -euo pipefail
for version in 0.1.42 0.1.43; do
  source=/opt/sentinel-grid/edge-agent/release/updates/$version
  destination=/opt/sentinel-grid/edge-agent/release/rejected-storage-updates/$version
  if [ -d "$source" ]; then
    if [ -e "$destination" ]; then echo "Quarantine target already exists: $destination" >&2; exit 1; fi
    sudo mkdir -p /opt/sentinel-grid/edge-agent/release/rejected-storage-updates
    sudo mv -- "$source" "$destination"
  fi
  sudo docker exec sentinel-gcp-control-plane sh -c '
    source=/app/edge-agent/release/updates/$1
    destination=/app/edge-agent/release/rejected-storage-updates/$1
    if [ -d "$source" ]; then
      test ! -e "$destination"
      mkdir -p /app/edge-agent/release/rejected-storage-updates
      mv -- "$source" "$destination"
    fi
  ' sh "$version"
done
echo 'Unassigned diagnostic deltas retained outside the public update artifact directory.'
