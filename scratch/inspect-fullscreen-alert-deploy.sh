set -e
cd /opt/sentinel-grid
sha256sum dashboard/components/global-alert-center.tsx
sudo docker inspect --format '{{.Image}} {{.Config.Image}}' sentinel-gcp-dashboard
sed -n '/^  dashboard:/,/^  [a-z].*:/p' deploy/gcp/docker-compose.gcp.yml | head -45
git status --short dashboard/components/global-alert-center.tsx
