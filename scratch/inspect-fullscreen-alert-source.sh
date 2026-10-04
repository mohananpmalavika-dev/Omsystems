set -e
cd /opt/sentinel-grid
rg -n 'FullscreenAlertPortal|IncidentImageModal|createPortal' dashboard/components/global-alert-center.tsx dashboard/components/fullscreen-alert-portal.tsx || true
sha256sum dashboard/components/global-alert-center.tsx dashboard/components/fullscreen-alert-portal.tsx
sudo docker ps --format '{{.Names}} {{.Status}}' | rg dashboard
sudo docker image ls sentinel-gcp-dashboard --format '{{.Repository}}:{{.Tag}} {{.ID}} {{.CreatedSince}}'
