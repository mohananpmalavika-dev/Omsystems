#!/usr/bin/env bash
set -euo pipefail
root=/opt/sentinel-grid
stage=/tmp/report-management-release-20261006-v2
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
activated=no
rollback_sources() {
 sudo python3 - "$stage" "$root" <<'PY'
import pathlib,json,shutil,sys
stage,root=map(pathlib.Path,sys.argv[1:])
for item in json.loads((stage/'manifest.json').read_text())['files']:
 target=root/item['path'];backup=stage/'source-before'/item['path']
 if backup.exists():shutil.copy2(backup,target)
 elif item['beforeSha256'] is None and target.exists():target.unlink()
PY
 sudo docker tag sentinel-gcp-control-plane:before-management-reports-20261006 sentinel-gcp-control-plane:latest
 sudo docker tag sentinel-gcp-dashboard:before-management-reports-20261006 sentinel-gcp-dashboard:latest
 if [ "$activated" = yes ]; then
  cd "$root/deploy/gcp"
  sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --no-build control-plane dashboard
 fi
}
trap 'rollback_sources' ERR
# Preserve any runtime-only production fixes outside the two report methods.
sudo docker cp sentinel-gcp-control-plane:/app/dist/src/store.js "$stage/store-runtime-before.js"
sudo python3 - "$stage" <<'PY'
import pathlib,re,sys
stage=pathlib.Path(sys.argv[1]);current=(stage/'store-runtime-before.js').read_text();updated=(stage/'dist/src/store.js').read_text()
for start,end in [('listAnalyticsAlerts','countAnalyticsAlerts'),('getAnalyticsAlert','updateAnalyticsAlertEvidence')]:
 pattern=rf'(?m)^    async {start}\([\s\S]*?(?=^    async {end}\()'
 replacement=re.search(pattern,updated);assert replacement,start
 current,count=re.subn(pattern,lambda _:replacement.group(),current);assert count==1,start
if 'import { resolveReportHierarchy }' not in current:
 current='import { resolveReportHierarchy } from "../packages/contracts/src/report-hierarchy.js";\n'+current
(stage/'dist/src/store.js').write_text(current)
PY
printf 'FROM sentinel-gcp-control-plane:before-management-reports-20261006\nCOPY dist/ /app/dist/\n' > "$stage/Dockerfile.control"
sudo docker build -t sentinel-gcp-control-plane:management-reports-20261006 -f "$stage/Dockerfile.control" "$stage"
cd "$root/deploy/gcp"
sudo docker compose -f docker-compose.gcp.yml build dashboard
# Only activate after both images have built successfully.
sudo docker tag sentinel-gcp-control-plane:management-reports-20261006 sentinel-gcp-control-plane:latest
activated=yes
sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --no-build control-plane dashboard
sudo docker ps --filter name=sentinel-gcp-control-plane --filter name=sentinel-gcp-dashboard --format '{{.Names}} {{.Status}}'
sudo docker cp "$stage/verify-live-management-reports.mjs" sentinel-gcp-control-plane:/tmp/verify-live-management-reports.mjs
for attempt in $(seq 1 20); do
 if sudo docker exec sentinel-gcp-control-plane node /tmp/verify-live-management-reports.mjs; then verified=yes;break;fi
 sleep 3
done
test "${verified:-no}" = yes
trap - ERR
printf 'Report source and runtime activated; previous images retained for rollback.\n'
