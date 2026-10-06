#!/usr/bin/env bash
set -euo pipefail
root=/opt/sentinel-grid
stage=/tmp/report-management-release-20261006
mkdir -p "$stage"
test ! -e "$stage/applied.txt"
tar xzf /tmp/report-management-release.tar.gz -C "$stage"
cp_image=$(sudo docker inspect sentinel-gcp-control-plane --format '{{.Image}}')
dash_image=$(sudo docker inspect sentinel-gcp-dashboard --format '{{.Image}}')
sudo docker tag "$cp_image" sentinel-gcp-control-plane:before-management-reports-20261006
sudo docker tag "$dash_image" sentinel-gcp-dashboard:before-management-reports-20261006
sudo python3 - "$stage" "$root" <<'PY'
import pathlib,json,hashlib,shutil,sys
stage,root=map(pathlib.Path,sys.argv[1:])
manifest=json.loads((stage/'manifest.json').read_text())
for file in manifest['files']:
 target=root/file['path'];expected=file['beforeSha256']
 if expected is None:assert not target.exists(),f'Concurrent new file: {file["path"]}'
 else:assert hashlib.sha256(target.read_bytes()).hexdigest()==expected,f'Concurrent source change: {file["path"]}'
 assert hashlib.sha256((stage/'source'/file['path']).read_bytes()).hexdigest()==file['afterSha256'],file['path']
for file in manifest['files']:
 target=root/file['path'];backup=stage/'source-before'/file['path']
 if target.exists():backup.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,backup)
 target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(stage/'source'/file['path'],target)
(stage/'applied.txt').write_text('Validated report source update\n')
PY
rollback_sources() {
 sudo python3 - "$stage" "$root" <<'PY'
import pathlib,json,shutil,sys
stage,root=map(pathlib.Path,sys.argv[1:])
for item in json.loads((stage/'manifest.json').read_text())['files']:
 target=root/item['path'];backup=stage/'source-before'/item['path']
 if backup.exists():shutil.copy2(backup,target)
 elif item['beforeSha256'] is None and target.exists():target.unlink()
PY
}
trap 'rollback_sources' ERR
printf 'FROM %s\nCOPY dist/ /app/dist/\n' "$cp_image" > "$stage/Dockerfile.control"
sudo docker build -t sentinel-gcp-control-plane:management-reports-20261006 -f "$stage/Dockerfile.control" "$stage"
cd "$root/deploy/gcp"
sudo docker compose -f docker-compose.gcp.yml build dashboard
# Only activate after both images have built successfully.
sudo docker tag sentinel-gcp-control-plane:management-reports-20261006 sentinel-grid-control-plane
sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --no-build control-plane dashboard
sudo docker ps --filter name=sentinel-gcp-control-plane --filter name=sentinel-gcp-dashboard --format '{{.Names}} {{.Status}}'
trap - ERR
printf 'Report source and runtime activated; previous images retained for rollback.\n'
