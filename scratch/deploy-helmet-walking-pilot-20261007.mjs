import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';

const camera='e66e3498-1c13-4f59-91d7-5a3386d269d2',agent='e9b95595-1aa6-4a14-9f5d-bd0c958d3f34';
const stamp=new Date().toISOString().replace(/[^0-9]/g,''),stage='tmp/helmet-walking-pilot-'+stamp;
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const replay=JSON.parse(fs.readFileSync('reports/helmet-pasted-review-replay-2026-10-07.json','utf8'));
const negatives=JSON.parse(fs.readFileSync('reports/helmet-head-evidence-raw-replay-2026-10-07.json','utf8'));
if(replay.summary.failed!==0||replay.summary.passed!==3||negatives.summary.negativeAlertFrames!==0)
 throw new Error('Positive/negative replay preflight failed');
const source=['src/app.ts','src/config.ts','src/index.ts','src/routes/edge-gateway-operations.routes.ts',
 'analytics-engine/src/app.ts','analytics-engine/src/detectors/helmet-detector.ts',
 'analytics-engine/src/inference/helmet-head-verification.ts','analytics-engine/Dockerfile'];
fs.mkdirSync(stage,{recursive:true});
const copy=(file,destination)=>{fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(file,destination);};
for(const file of source){
 copy(file,stage+'/source/'+file);
 if(file.endsWith('.ts')){
  const relative=file.replace(/\.ts$/,'.js');
  const build=file.startsWith('analytics-engine/')?'analytics-engine/dist/':'dist/';
  copy(build+relative,stage+'/runtime/'+(file.startsWith('analytics-engine/')?'analytics':'control')+'/dist/'+relative);
 }
}
const version='0.1.49',bundle='edge-agent/release/updates/'+version+'/edge-agent.bundle';
const bundleManifest=JSON.parse(fs.readFileSync('edge-agent/release/updates/'+version+'/manifest.json','utf8'));
if(bundleManifest.sha256!==sha(bundle)||bundleManifest.version!==version)throw new Error('Delta bundle checksum mismatch');
copy(bundle,stage+'/source/'+bundle);
copy(bundle,stage+'/runtime/control/'+bundle);
const compiled=fs.readFileSync('analytics-engine/dist/analytics-engine/src/detectors/helmet-detector.js','utf8');
if(!compiled.includes('person.boundingBox.height * frame.height < 72'))throw new Error('Build is missing the source-pixel gate');
const files=[...source,bundle].map(file=>({file,sha256:sha(file)}));
fs.writeFileSync(stage+'/validation.json',JSON.stringify({stamp,camera,agent,version,files,
 runtime:source.filter(file=>file.endsWith('.ts')).map(file=>{
  const relative=file.replace(/\.ts$/,'.js'),build=file.startsWith('analytics-engine/')?'analytics-engine/dist/':'dist/';
  return {container:file.startsWith('analytics-engine/')?'analytics':'control',file:relative,sha256:sha(build+relative)};
 }),bundleSha256:sha(bundle)},null,2));
function run(command,timeout=300000){const r=spawnSync(command,{shell:true,encoding:'utf8',timeout,maxBuffer:5*1024*1024});
 if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);
 if(r.status!==0)throw new Error('Release command failed: '+r.status);}
const archive=stage+'.tar.gz';run('tar -czf '+archive+' -C '+stage+' source runtime validation.json');
console.log(JSON.stringify({archive,sha256:sha(archive),camera,agent,version}));
if(!process.argv.includes('--apply'))process.exit(0);
const cloud='--zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet';
run('gcloud compute scp '+archive+' kryptovision-server:/tmp/helmet-walking-'+stamp+'.tar.gz '+cloud);

const remote="set -euo pipefail\nroot=/opt/sentinel-grid\nstage=\"$root/helmet-walking-releases/STAMP\"\necho 'ARCHIVE_HASH  /tmp/helmet-walking-STAMP.tar.gz' | sha256sum -c -\nsudo mkdir -p \"$stage/package\" \"$stage/backup\"\nsudo chmod 700 \"$stage\" \"$stage/backup\"\nsudo tar -xzf /tmp/helmet-walking-STAMP.tar.gz -C \"$stage/package\"\nsudo docker exec sentinel-gcp-analytics-engine node --input-type=module -e 'import fs from \"node:fs\";import{createHash}from\"node:crypto\";if(createHash(\"sha256\").update(fs.readFileSync(\"/app/models/safety/helmet-head-embedding.onnx\")).digest(\"hex\")!==\"583fd1110a514667812fee7d684952aaf82a99b959760c8d7dca7e0ab9839299\")throw Error(\"Feature model mismatch\");'\nfor service in control-plane analytics-engine; do\n image=$(sudo docker inspect -f '{{.Image}}' sentinel-gcp-$service)\n sudo docker tag \"$image\" sentinel-helmet-$service:before-STAMP\ndone\nsudo tee \"$stage/rollback.sh\" >/dev/null <<'ROLLBACK'\n#!/bin/bash\nset -euo pipefail\nsudo python3 - <<'PY'\nimport json,pathlib,shutil\nroot=pathlib.Path('/opt/sentinel-grid');stage=root/'helmet-walking-releases/STAMP'\nfor item in json.loads((stage/'backup-state.json').read_text()):\n target=(root/item['path']).resolve()\n if not target.is_relative_to(root):raise RuntimeError('Invalid rollback path')\n if item['existed']:shutil.copy2(stage/'backup'/item['path'],target)\n elif target.is_file():target.unlink()\nPY\nfor service in control-plane analytics-engine; do sudo docker tag sentinel-helmet-$service:before-STAMP sentinel-gcp-$service:latest; done\ncd /opt/sentinel-grid/deploy/gcp\nsudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate analytics-engine control-plane\nROLLBACK\nsudo chmod 700 \"$stage/rollback.sh\"\ntrap 'if [ -f \"$stage/backup-state.json\" ]; then sudo bash \"$stage/rollback.sh\"; fi' ERR\nsudo python3 - \"$root\" \"$stage\" <<'PY'\nimport hashlib,json,pathlib,shutil,sys\nroot,stage=map(pathlib.Path,sys.argv[1:]);package=stage/'package';data=json.loads((package/'validation.json').read_text())\nfor item in data['files']:\n candidate=package/'source'/item['file']\n if hashlib.sha256(candidate.read_bytes()).hexdigest()!=item['sha256']:raise RuntimeError('Package hash mismatch')\nexisting=root/'edge-agent/release/updates/0.1.49/edge-agent.bundle'\nif existing.exists() and hashlib.sha256(existing.read_bytes()).hexdigest()!=data['bundleSha256']:raise RuntimeError('Existing immutable bundle version differs')\ncompose=root/'deploy/gcp/docker-compose.gcp.yml';text=compose.read_text()\nfor name,value in [('HELMET_HD_CAPTURE_CAMERAS',data['camera']),('EDGE_PACKAGED_UPDATE_VERSION',data['version']),('EDGE_PACKAGED_UPDATE_TARGET_AGENTS',data['agent'])]:\n line='      '+name+': \"'+value+'\"'\n rows=text.splitlines();matches=[i for i,row in enumerate(rows) if row.startswith('      '+name+':')]\n if len(matches)>1:raise RuntimeError('Ambiguous environment setting')\n if matches:rows[matches[0]]=line\n else:\n  anchors=[i for i,row in enumerate(rows) if row.startswith('      ANALYTICS_ENGINE_URL:')]\n  if len(anchors)!=1:raise RuntimeError('Missing control-plane environment anchor')\n  rows.insert(anchors[0]+1,line)\n text='\\n'.join(rows)+'\\n'\npaths=[pathlib.Path(item['file']) for item in data['files']]+[pathlib.Path('deploy/gcp/docker-compose.gcp.yml')]\nstates=[]\nfor relative in paths:\n target=(root/relative).resolve()\n if not target.is_relative_to(root):raise RuntimeError('Invalid release path')\n states.append({'path':str(relative),'existed':target.exists()})\n if target.exists():\n  backup=stage/'backup'/relative;backup.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,backup)\n(stage/'backup-state.json').write_text(json.dumps(states))\nfor item in data['files']:\n target=root/item['file'];target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(package/'source'/item['file'],target)\ncompose.write_text(text)\nPY\nprintf 'FROM sentinel-helmet-control-plane:before-STAMP\\nCOPY runtime/control/ /app/\\n' | sudo tee \"$stage/package/Dockerfile.control\" >/dev/null\nprintf 'FROM sentinel-helmet-analytics-engine:before-STAMP\\nCOPY --chown=analytics:analytics runtime/analytics/ /app/\\n' | sudo tee \"$stage/package/Dockerfile.analytics\" >/dev/null\nsudo docker build -f \"$stage/package/Dockerfile.control\" -t sentinel-gcp-control-plane:helmet-STAMP \"$stage/package\"\nsudo docker build -f \"$stage/package/Dockerfile.analytics\" -t sentinel-gcp-analytics-engine:helmet-STAMP \"$stage/package\"\nsudo docker tag sentinel-gcp-control-plane:helmet-STAMP sentinel-gcp-control-plane:latest\nsudo docker tag sentinel-gcp-analytics-engine:helmet-STAMP sentinel-gcp-analytics-engine:latest\ncd \"$root/deploy/gcp\"\nsudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate analytics-engine control-plane\nfor tick in $(seq 1 24); do\n a=$(sudo docker inspect -f '{{.State.Health.Status}}' sentinel-gcp-analytics-engine)\n c=$(sudo docker inspect -f '{{.State.Health.Status}}' sentinel-gcp-control-plane)\n if [ \"$a\" = healthy ] && [ \"$c\" = healthy ]; then\n  echo RELEASE_JSON '{\"release\":\"STAMP\",\"rollback\":\"/opt/sentinel-grid/helmet-walking-releases/STAMP/rollback.sh\",\"pilotCamera\":\"__PILOT_CAMERA__\",\"pilotAgent\":\"__PILOT_AGENT__\",\"gatewayPatch\":\"0.1.49\"}'\n  exit 0\n fi\n sleep 5\ndone\necho 'Release health checks did not pass' >&2\nfalse\n"
 .replaceAll('STAMP',stamp).replaceAll('ARCHIVE_HASH',sha(archive)).replaceAll('__PILOT_CAMERA__',camera).replaceAll('__PILOT_AGENT__',agent);
run('gcloud compute ssh kryptovision-server '+cloud+' --command="echo '+gzipSync(Buffer.from(remote)).toString('base64')+
 ' | base64 -d | gzip -d > /tmp/helmet-walking-run-'+stamp+'.sh && bash /tmp/helmet-walking-run-'+stamp+'.sh < /dev/null"');
