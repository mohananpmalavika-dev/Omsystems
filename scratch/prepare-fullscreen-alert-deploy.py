import base64
import gzip
import hashlib
import pathlib
import subprocess

root = pathlib.Path(__file__).resolve().parent.parent
main = 'dashboard/components/global-alert-center.tsx'
baseline = subprocess.check_output(['git', 'show', 'HEAD:' + main], cwd=root)
expected = hashlib.sha256(baseline).hexdigest()
assert expected == '56a1c08d4c01be3107af35de4f7e0ca3ec453c092472ae866677120bab1023c4', 'Remote baseline differs; do not overwrite concurrent changes'
script = f'''set -euo pipefail
cd /opt/sentinel-grid
test "$(sha256sum {main} | cut -d ' ' -f1)" = {expected}
backup=/tmp/sentinel-fullscreen-alert-20261004
sudo mkdir -p "$backup"
sudo cp {main} "$backup/global-alert-center.tsx"
original_image=$(sudo docker inspect --format '{{{{.Image}}}}' sentinel-gcp-dashboard)
sudo docker image tag "$original_image" sentinel-gcp-dashboard:before-fullscreen-alert-20261004
'''
for name in [main, 'dashboard/components/fullscreen-alert-portal.tsx']:
    encoded = base64.b64encode(gzip.compress((root / name).read_bytes())).decode()
    script += f"printf %s '{encoded}' | base64 -d | gzip -d | sudo tee {name} >/dev/null\n"
script += '''cd /opt/sentinel-grid/deploy/gcp
sudo docker compose -f docker-compose.gcp.yml build dashboard
sudo docker compose -f docker-compose.gcp.yml up -d --no-deps dashboard
healthy=0
for attempt in $(seq 1 30); do
  if curl --silent --fail http://127.0.0.1:10000/login >/dev/null; then healthy=1; break; fi
  sleep 2
done
if [ "$healthy" -ne 1 ]; then
  sudo docker image tag sentinel-gcp-dashboard:before-fullscreen-alert-20261004 sentinel-gcp-dashboard:latest
  sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate dashboard
  sudo cp "$backup/global-alert-center.tsx" /opt/sentinel-grid/dashboard/components/global-alert-center.tsx
  echo 'Dashboard health failed; previous image restored' >&2
  exit 1
fi
echo 'Fullscreen alert dashboard deployed; login health passed'
sudo docker inspect --format '{{.Image}}' sentinel-gcp-dashboard
'''
(root / 'scratch/deploy-fullscreen-alert-2026-10-04.sh').write_text(script, encoding='utf-8', newline='\n')
print('Prepared guarded dashboard-only deployment')
