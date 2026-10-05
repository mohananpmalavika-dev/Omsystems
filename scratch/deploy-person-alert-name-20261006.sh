set -Eeuo pipefail
target=sentinel-gcp-control-plane
stage=/tmp/sentinel-person-alert-name-20261006
source_file=/opt/sentinel-grid/src/analytics/rule-engine.ts
mkdir -p "$stage"
test ! -e "$stage/deployed.txt"
old_image=$(sudo docker inspect "$target" --format '{{.Image}}')
image_tag=$(sudo docker inspect "$target" --format '{{.Config.Image}}')
test "$image_tag" = sentinel-gcp-control-plane:latest
backup_tag=sentinel-gcp-control-plane:before-person-alert-name-20261006
candidate=sentinel-gcp-control-plane:person-alert-name-20261006
sudo docker tag "$old_image" "$backup_tag"
sudo docker cp "$target":/app/dist/src/analytics/rule-engine.js "$stage/rule-engine.before.js"
sudo cp "$source_file" "$stage/rule-engine.before.ts"
sudo python3 - "$stage" "$source_file" <<'PY'
import pathlib, sys
stage = pathlib.Path(sys.argv[1])
source = pathlib.Path(sys.argv[2])
js = (stage / 'rule-engine.before.js').read_text()
anchor = 'export function analyticsAlertTitle(rule, metadata) {\n'
assert js.count(anchor) == 1 and 'Person Detected after office hour' not in js
addition = '    if (rule.detectionType === "person" && rule.schedule && rule.schedule.start > rule.schedule.end) {\n        return "Person Detected after office hour";\n    }\n'
(stage / 'rule-engine.js').write_text(js.replace(anchor, anchor + addition, 1))
ts = source.read_text()
anchor = 'export function analyticsAlertTitle(rule: AnalyticsRule, metadata?: Record<string, unknown>) {\n'
assert ts.count(anchor) == 1 and 'Person Detected after office hour' not in ts
addition = '  if (rule.detectionType === "person" && rule.schedule && rule.schedule.start > rule.schedule.end) {\n    return "Person Detected after office hour";\n  }\n'
(stage / 'rule-engine.ts').write_text(ts.replace(anchor, anchor + addition, 1))
PY
printf '%s\n' "FROM $backup_tag" 'COPY rule-engine.js /app/dist/src/analytics/rule-engine.js' > "$stage/Dockerfile"
sudo docker build -t "$candidate" "$stage"
sudo docker run --rm --entrypoint node "$candidate" --check /app/dist/src/analytics/rule-engine.js
sudo docker run --rm -i --entrypoint node "$candidate" --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { analyticsAlertTitle } from '/app/dist/src/analytics/rule-engine.js';
assert.equal(analyticsAlertTitle({detectionType:'person',schedule:{start:'20:00',end:'08:00'}}),'Person Detected after office hour');
assert.equal(analyticsAlertTitle({detectionType:'person'}),'Person detected');
assert.equal(analyticsAlertTitle({detectionType:'person',schedule:{start:'08:00',end:'20:00'}}),'Person detected');
assert.equal(analyticsAlertTitle({detectionType:'helmet-worn'}),'Helmet worn detected');
console.log('Candidate alert titles verified');
JS
test "$(sudo docker inspect "$target" --format '{{.Image}}')" = "$old_image"
rollback() {
 sudo docker tag "$old_image" "$image_tag"
 sudo cp "$stage/rule-engine.before.ts" "$source_file"
 cd /opt/sentinel-grid/deploy/gcp
 sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate control-plane
}
trap rollback ERR
sudo docker tag "$candidate" "$image_tag"
sudo cp "$stage/rule-engine.ts" "$source_file"
cd /opt/sentinel-grid/deploy/gcp
sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate control-plane
ready=false
for attempt in $(seq 1 24); do
 if curl --silent --fail http://127.0.0.1:8080/ready >/dev/null; then ready=true;break;fi
 sleep 2
done
test "$ready" = true
sudo docker cp "$target":/app/dist/src/analytics/rule-engine.js "$stage/rule-engine.active.js"
cmp "$stage/rule-engine.js" "$stage/rule-engine.active.js"
date -u > "$stage/deployed.txt"
trap - ERR
echo 'Person alert title deployed; control plane ready'
