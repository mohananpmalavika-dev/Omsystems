set -e
root=/opt/sentinel-grid/edge-agent/release/updates/0.1.48
if [ -f "$root/edge-agent.bundle" ]; then
 test "$(sha256sum "$root/edge-agent.bundle" | cut -d' ' -f1)" = '82fb4df1e7aaf11418983ba1cb1447e2e87e6fd462a326346be03ca08f824c1b'
 sudo mv "$root/edge-agent.bundle" "$root/edge-agent.bundle.rejected"
fi
sudo docker exec sentinel-gcp-control-plane sh -c 'if [ -f /app/edge-agent/release/updates/0.1.48/edge-agent.bundle ]; then mv /app/edge-agent/release/updates/0.1.48/edge-agent.bundle /app/edge-agent/release/updates/0.1.48/edge-agent.bundle.rejected; fi'
printf '%s\n' 'Failed pilot delta quarantined; original 0.1.47 agent retained'
