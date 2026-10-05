set -Eeuo pipefail
stage=/tmp/sentinel-opening-settings-20261006
root=/opt/sentinel-grid
mkdir -p "$stage"
test ! -e "$stage/prepared.txt"
tar xzf /tmp/opening-settings-20261006.tar.gz -C "$stage"
cp_image=$(sudo docker inspect sentinel-gcp-control-plane --format '{{.Image}}')
dash_image=$(sudo docker inspect sentinel-gcp-dashboard --format '{{.Image}}')
sudo docker tag "$cp_image" sentinel-gcp-control-plane:before-opening-settings-20261006
sudo docker tag "$dash_image" sentinel-gcp-dashboard:before-opening-settings-20261006
# Validate all baselines and prepare backups before modifying any server source.
sudo python3 - "$stage" "$root" <<'PY'
import hashlib,json,pathlib,shutil,sys
stage,root=map(pathlib.Path,sys.argv[1:]);plan=json.loads((stage/'plan.json').read_text())
for item in plan['files']:
 name=item['path'];contents=(root/name).read_text()
 assert hashlib.sha256(contents.encode()).hexdigest()==item['beforeHash'],f'Source changed: {name}'
patch=plan['apiPatch'];assert (root/patch['path']).read_text().count(patch['before'])==1
for name in [item['path'] for item in plan['files']]+[patch['path']]:
 backup=stage/'source-before'/name;backup.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/name,backup)
for name in ['database/migrations/20261006_branch_opening_defaults.sql','scripts/verify-opening-defaults.mjs']:
 assert not (root/name).exists(),f'File already exists: {name}'
(stage/'prepared.txt').write_text('Baselines and backups verified\n')
PY
rollback() {
 sudo docker tag "$cp_image" sentinel-gcp-control-plane:latest
 sudo docker tag "$dash_image" sentinel-gcp-dashboard:latest
 sudo python3 - "$stage" "$root" <<'PY'
import json,pathlib,shutil,sys
stage,root=map(pathlib.Path,sys.argv[1:]);plan=json.loads((stage/'plan.json').read_text())
for name in [item['path'] for item in plan['files']]+[plan['apiPatch']['path']]:shutil.copy2(stage/'source-before'/name,root/name)
PY
 cd "$root/deploy/gcp"
 sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate control-plane dashboard
}
trap rollback ERR
# Validate the migration and insertion defaults inside a transaction that rolls back.
python3 - "$stage" <<'PY' | sudo docker exec -i sentinel-gcp-control-plane node --input-type=module > "$stage/migration-preview.log"
import json,pathlib,sys
stage=pathlib.Path(sys.argv[1]);migration=(stage/'source/database/migrations/20261006_branch_opening_defaults.sql').read_text()
print('globalThis.openingDefaultsMigration='+json.dumps(migration)+';')
print((stage/'source/scripts/verify-opening-defaults.mjs').read_text())
PY
cat "$stage/migration-preview.log"
mkdir -p "$stage/control"
cp -r "$stage/dist" "$stage/control/dist"
printf '%s\n' 'FROM sentinel-gcp-control-plane:before-opening-settings-20261006' 'COPY dist/ /app/dist/' > "$stage/control/Dockerfile"
sudo docker build -t sentinel-gcp-control-plane:opening-settings-20261006 "$stage/control"
for module in analytics/nbfc-rule-repository analytics/nbfc-rule-engine.service routes/nbfc-analytics.routes; do
 sudo docker run --rm --entrypoint node sentinel-gcp-control-plane:opening-settings-20261006 --check "/app/dist/src/$module.js"
done
sudo docker run --rm -i -e NODE_ENV=test --entrypoint node sentinel-gcp-control-plane:opening-settings-20261006 --input-type=module < "$stage/source/scratch/verify-opening-settings-api-20261006.mjs" > "$stage/api-preview.log"
cat "$stage/api-preview.log"
sudo python3 - "$stage" "$root" <<'PY'
import json,pathlib,shutil,sys
stage,root=map(pathlib.Path,sys.argv[1:]);plan=json.loads((stage/'plan.json').read_text())
for item in plan['files']:shutil.copy2(stage/'source'/item['path'],root/item['path'])
patch=plan['apiPatch'];target=root/patch['path'];target.write_text(target.read_text().replace(patch['before'],patch['after'],1))
PY
sudo docker build -f "$root/dashboard/Dockerfile" -t sentinel-gcp-dashboard:opening-settings-20261006 "$root" > "$stage/dashboard-build.log" 2>&1
test "$(sudo docker inspect sentinel-gcp-control-plane --format '{{.Image}}')" = "$cp_image"
test "$(sudo docker inspect sentinel-gcp-dashboard --format '{{.Image}}')" = "$dash_image"
sudo docker tag sentinel-gcp-control-plane:opening-settings-20261006 sentinel-gcp-control-plane:latest
sudo docker tag sentinel-gcp-dashboard:opening-settings-20261006 sentinel-gcp-dashboard:latest
cd "$root/deploy/gcp"
sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate control-plane dashboard
ready=false
for attempt in $(seq 1 30); do
 if curl --silent --fail http://127.0.0.1:8080/ready >/dev/null && curl --silent --fail http://127.0.0.1:10000/login >/dev/null; then ready=true;break;fi
 sleep 2
done
test "$ready" = true
# Apply just this migration and its checksum/audit entry in one transaction.
python3 - "$stage" <<'PY' | sudo docker exec -i sentinel-gcp-postgres psql -X -v ON_ERROR_STOP=1 -U sentinel_admin -d sentinel_grid
import hashlib,pathlib,sys
stage=pathlib.Path(sys.argv[1]);sql=(stage/'source/database/migrations/20261006_branch_opening_defaults.sql').read_text()
checksum=hashlib.sha256(sql.encode()).hexdigest()
print("BEGIN; SET LOCAL lock_timeout='5s'; SELECT pg_advisory_xact_lock(7184225991);")
print(sql)
print("INSERT INTO schema_migrations (filename,checksum) VALUES ('20261006_branch_opening_defaults.sql','"+checksum+"');")
print("INSERT INTO audit_events (tenant_id,action,outcome,details) VALUES ('00000000-0000-4000-8000-000000000001','branch_opening_defaults.configured','success','{\"window\":\"08:00-11:00\",\"timezone\":\"Asia/Kolkata\",\"enabled\":true,\"scope\":\"new branches and cameras\"}'::jsonb); COMMIT;")
PY
# Keep durable source copies for the next normal image build.
sudo cp "$stage/source/database/migrations/20261006_branch_opening_defaults.sql" "$root/database/migrations/"
sudo cp "$stage/source/scripts/verify-opening-defaults.mjs" "$root/scripts/"
sudo docker exec -i sentinel-gcp-control-plane node --input-type=module < "$stage/source/scripts/verify-opening-defaults.mjs" > "$stage/migration-active.log"
cat "$stage/migration-active.log"
sudo docker exec sentinel-gcp-dashboard test -f /app/dashboard/.next/server/app/nbfc-operations/page.js
date -u > "$stage/deployed.txt"
trap - ERR
echo 'Opening defaults and editable time/alert mode deployed; services ready'
