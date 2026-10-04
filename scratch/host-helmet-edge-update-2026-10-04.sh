set -e
stage=/tmp/helmet-edge-update-0.1.48
mkdir -p "$stage"
tar xzf /tmp/helmet-edge-update-0.1.48.tar.gz -C "$stage"
test "$(sha256sum "$stage/edge-agent.bundle" | cut -d' ' -f1)" = '82fb4df1e7aaf11418983ba1cb1447e2e87e6fd462a326346be03ca08f824c1b'
root=/opt/sentinel-grid/edge-agent/release/updates/0.1.48
if [ -e "$root/edge-agent.bundle" ]; then cmp "$stage/edge-agent.bundle" "$root/edge-agent.bundle"; fi
sudo mkdir -p "$root"
sudo install -m 0644 "$stage/edge-agent.bundle" "$root/edge-agent.bundle"
sudo install -m 0644 "$stage/manifest.json" "$root/manifest.json"
sudo docker exec sentinel-gcp-control-plane mkdir -p /app/edge-agent/release/updates
sudo docker cp "$root" sentinel-gcp-control-plane:/app/edge-agent/release/updates/0.1.48
printf '%s\n' 'Pilot delta hosted; no update release or fleet rollout enabled'
