set -e
sudo docker exec sentinel-gcp-control-plane sh -c 'find /app/dist -path "*/branch-protection/routes.js"; ls /app/dist/src/branch-protection/routes.js'
sudo docker inspect sentinel-gcp-control-plane --format '{{.Image}}'
sudo docker inspect sentinel-gcp-dashboard --format '{{.Image}}'
cd /opt/sentinel-grid
git diff --stat
