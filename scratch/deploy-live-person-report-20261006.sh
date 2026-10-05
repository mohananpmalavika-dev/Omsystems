set -Eeuo pipefail
stage=/tmp/sentinel-live-person-report-20261006
root=/opt/sentinel-grid
mkdir -p "$stage"
test ! -e "$stage/prepared.txt"
tar xzf /tmp/live-person-report-20261006.tar.gz -C "$stage"
cp_image=$(sudo docker inspect sentinel-gcp-control-plane --format '{{.Image}}')
ai_image=$(sudo docker inspect sentinel-gcp-analytics-engine --format '{{.Image}}')
dash_image=$(sudo docker inspect sentinel-gcp-dashboard --format '{{.Image}}')
sudo docker tag "$cp_image" sentinel-gcp-control-plane:before-live-person-report-20261006
sudo docker tag "$ai_image" sentinel-gcp-analytics-engine:before-live-person-report-20261006
sudo docker tag "$dash_image" sentinel-gcp-dashboard:before-live-person-report-20261006
mkdir -p "$stage/control/dist/src/analytics" "$stage/analytics/dist/analytics-engine/src"
sudo docker cp sentinel-gcp-control-plane:/app/dist/src/app.js "$stage/control/dist/src/app.js"
sudo docker cp sentinel-gcp-control-plane:/app/dist/src/analytics/rule-engine.js "$stage/control/dist/src/analytics/rule-engine.js"
sudo docker cp sentinel-gcp-analytics-engine:/app/dist/analytics-engine/src/app.js "$stage/analytics/dist/analytics-engine/src/app.js"
sudo docker cp sentinel-gcp-analytics-engine:/app/dist/analytics-engine/src/analytics-pipeline.js "$stage/analytics/dist/analytics-engine/src/analytics-pipeline.js"
sudo python3 - "$stage" "$root" <<'PY'
import hashlib,json,pathlib,shutil,sys
stage,root=map(pathlib.Path,sys.argv[1:])
plan=json.loads((stage/'patches.json').read_text())
expected={'src/app.ts':'38f5436d50828024c42731fa88ae753d5e27d2627845e83961025843f50bbe3d',
 'analytics-engine/src/app.ts':'6af1b2f4ec3517c0e154f48f964a2135102981661b1ce9382a8a5c1e53a0ecfc',
 'analytics-engine/src/analytics-pipeline.ts':'497a4d38dcc3870a8feb0874317fd2eb79089c6dbdf8ae3a9e76e2d47bae2447',
 'src/analytics/rule-engine.ts':'f305f72c6f94223ca60ed77ed74147c7e45d5ec1f810b9f83de951f7b0a3df18',
 'dashboard/lib/api-client.ts':'ec357ac0a06dcd5eb38f225d636f8f4d09cb51ce9e3882021e001458a5820383',
 'dashboard/components/app-layout.tsx':'48d38627ccd233696110c755099964e3e266d71bae55303ad1395ad031f7a9a4',
 'dashboard/components/live-wall-windows.tsx':'61079c454a47d2bb002835499a17aa56c69521f6f4ed726224a69961c9c33a01',
 'dashboard/app/reports/page.tsx':'d2f41eddef28f0b4c75f1a7c7c73ef2d73427ffb9b3f1ac5ec3b599f32ae5103'}
for name,digest in expected.items():assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest, f'Concurrent source change: {name}'
sources={name:(root/name).read_text() for name in expected}
for change in plan['changes']:
 name=change['path']; before=change['before'];after=change['after']
 assert sources[name].count(before)==1, f'Source anchor mismatch: {name} {before[:80]}'
 sources[name]=sources[name].replace(before,after,1)
 if not name.startswith('dashboard/'):
  target=stage/('analytics' if name.startswith('analytics-engine/') else 'control')/'dist'/name.replace('.ts','.js')
  contents=target.read_text();before=change.get('runtimeBefore',change['before']);after=change.get('runtimeAfter',change['after'])
  if before=='':continue
  assert contents.count(before)==1, f'Runtime anchor mismatch: {name} {before[:80]}'
  target.write_text(contents.replace(before,after,1))
for name in plan['newFiles']:assert not (root/name).exists(), f'New file already exists: {name}'
for name in sources:
 backup=stage/'source-before'/name;backup.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/name,backup)
(stage/'prepared.txt').write_text('All source and runtime patches validated\n')
for name,contents in sources.items():(root/name).write_text(contents)
for name in plan['newFiles']:
 target=root/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(stage/'source'/name,target)
for service in ('control','analytics'):
 for source in (stage/'dist').rglob('*.js'):
  if service=='analytics' and source.relative_to(stage/'dist').parts[0]=='src':continue
  target=stage/service/'dist'/source.relative_to(stage/'dist');target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
PY
rollback() {
 sudo docker tag "$cp_image" sentinel-gcp-control-plane:latest
 sudo docker tag "$ai_image" sentinel-gcp-analytics-engine:latest
 sudo docker tag "$dash_image" sentinel-gcp-dashboard:latest
 sudo python3 - "$stage" "$root" <<'PY'
import json,pathlib,shutil,sys
stage,root=map(pathlib.Path,sys.argv[1:]);plan=json.loads((stage/'patches.json').read_text())
for name in set(change['path'] for change in plan['changes']):shutil.copy2(stage/'source-before'/name,root/name)
for name in plan['newFiles']:
 target=(root/name).resolve();assert target.is_relative_to(root.resolve())
 if target.exists():target.unlink()
PY
 cd "$root/deploy/gcp"
 sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate control-plane analytics-engine dashboard
}
trap rollback ERR
printf '%s\n' 'FROM sentinel-gcp-control-plane:before-live-person-report-20261006' 'COPY dist/ /app/dist/' > "$stage/control/Dockerfile"
printf '%s\n' 'FROM sentinel-gcp-analytics-engine:before-live-person-report-20261006' 'COPY --chown=analytics:analytics dist/ /app/dist/' > "$stage/analytics/Dockerfile"
sudo docker build -t sentinel-gcp-control-plane:live-person-report-20261006 "$stage/control"
sudo docker build -t sentinel-gcp-analytics-engine:live-person-report-20261006 "$stage/analytics"
sudo docker run --rm --entrypoint node sentinel-gcp-control-plane:live-person-report-20261006 --check /app/dist/src/app.js
sudo docker run --rm --entrypoint node sentinel-gcp-analytics-engine:live-person-report-20261006 --check /app/dist/analytics-engine/src/app.js
sudo docker run --rm --entrypoint node sentinel-gcp-analytics-engine:live-person-report-20261006 --check /app/dist/analytics-engine/src/analytics-pipeline.js
sudo docker run --rm --entrypoint node sentinel-gcp-control-plane:live-person-report-20261006 --input-type=module -e 'import {buildLivePersonCountReport} from "/app/dist/src/analytics/live-person-count.service.js";import {sortedMatchingRules,analyticsAlertTitle} from "/app/dist/src/analytics/rule-engine.js";if(typeof buildLivePersonCountReport!=="function")process.exit(1);if(analyticsAlertTitle({detectionType:"person",schedule:{start:"20:00",end:"08:00"}})!=="Person Detected after office hour")process.exit(1);console.log("Candidate imports and overnight title verified");'
sudo docker build -f "$root/dashboard/Dockerfile" -t sentinel-gcp-dashboard:live-person-report-20261006 "$root" > "$stage/dashboard-build.log" 2>&1
test "$(sudo docker inspect sentinel-gcp-control-plane --format '{{.Image}}')" = "$cp_image"
test "$(sudo docker inspect sentinel-gcp-analytics-engine --format '{{.Image}}')" = "$ai_image"
test "$(sudo docker inspect sentinel-gcp-dashboard --format '{{.Image}}')" = "$dash_image"
sudo docker tag sentinel-gcp-control-plane:live-person-report-20261006 sentinel-gcp-control-plane:latest
sudo docker tag sentinel-gcp-analytics-engine:live-person-report-20261006 sentinel-gcp-analytics-engine:latest
sudo docker tag sentinel-gcp-dashboard:live-person-report-20261006 sentinel-gcp-dashboard:latest
cd "$root/deploy/gcp"
sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate analytics-engine control-plane dashboard
ready=false
for attempt in $(seq 1 60); do
 if curl --silent --fail http://127.0.0.1:8080/ready >/dev/null && curl --silent --fail http://127.0.0.1:10000/login >/dev/null && sudo docker exec sentinel-gcp-analytics-engine node --input-type=module -e 'const h=await(await fetch("http://localhost:8092/health")).json();if(h.aiState!=="AI_OPERATIONAL")process.exit(1);' 2>/dev/null; then ready=true;break;fi
 sleep 2
done
test "$ready" = true
sudo docker exec sentinel-gcp-dashboard test -f /app/dashboard/.next/server/app/reports/live-person-count/page.js
date -u > "$stage/deployed.txt"
trap - ERR
echo 'Live person-count report deployed; all three service readiness checks passed'
