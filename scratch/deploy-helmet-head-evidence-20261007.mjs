import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const cameras='*';
const stamp=new Date().toISOString().replace(/[^0-9]/g,'');
const stage='tmp/helmet-head-deploy-'+stamp;
const archive=stage+'.tar.gz';
const sourceFiles=['analytics-engine/src/detectors/helmet-detector.ts',
 'analytics-engine/src/inference/configured-model-inference.ts','analytics-engine/src/inference/helmet-head-verification.ts',
 'analytics-engine/src/inference/helmet-head-classification.ts','analytics-engine/src/inference/helmet-head-probe.ts',
 'analytics-engine/src/model-manager.ts'];
const replay=JSON.parse(fs.readFileSync('reports/helmet-head-evidence-raw-replay-2026-10-07.json','utf8'));
if(replay.summary.negativeAlertFrames!==0||replay.summary.ch4AlertFrames<1||replay.summary.ch8AlertFrames<1)
 throw new Error('Walking or negative replay validation failed');
const entry=JSON.parse(fs.readFileSync('analytics-engine/models/manifest.json','utf8')).models.find(m=>m.id==='helmet-head-evidence');
const modelPath='analytics-engine/models/'+entry.path;
if(createHash('sha256').update(fs.readFileSync(modelPath)).digest('hex')!==entry.sha256)throw new Error('Model checksum mismatch');
const files=[...sourceFiles,'analytics-engine/THIRD_PARTY_MODELS.md',modelPath];
fs.mkdirSync(stage,{recursive:true});
function copy(source,destination){fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(source,destination);}
for(const file of files)copy(file,stage+'/source/'+file);
for(const file of sourceFiles){const relative=file.replace(/\.ts$/,'.js');copy('analytics-engine/dist/'+relative,stage+'/runtime/dist/'+relative);}
fs.writeFileSync(stage+'/head-model-entry.json',JSON.stringify(entry));
fs.writeFileSync(stage+'/validation.json',JSON.stringify({stamp,cameras,replay:replay.summary,files:files.map(file=>({file,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')}))},null,2));
function run(command,timeout=600000){const r=spawnSync(command,{shell:true,encoding:'utf8',timeout,maxBuffer:15*1024*1024});
 if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);
 if(r.status!==0)throw new Error('Command failed with status '+r.status);return r;}
run('tar -czf '+archive+' -C '+stage+' source runtime head-model-entry.json validation.json');
console.log(JSON.stringify({archive,sha256:createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),validation:replay.summary}));
if(!process.argv.includes('--apply'))process.exit(0);
const cloud='--zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet';
run('gcloud compute scp '+archive+' kryptovision-server:/tmp/helmet-head-'+stamp+'.tar.gz '+cloud);
const remote=`set -euo pipefail
root=/opt/sentinel-grid
stage=/opt/sentinel-grid/helmet-head-releases/${stamp}
echo '${createHash('sha256').update(fs.readFileSync(archive)).digest('hex')}  /tmp/helmet-head-${stamp}.tar.gz' | sha256sum -c -
sudo mkdir -p "$stage/package" "$stage/backup"
sudo tar -xzf /tmp/helmet-head-${stamp}.tar.gz -C "$stage/package"
base=$(sudo docker inspect -f '{{.Image}}' sentinel-gcp-analytics-engine)
sudo docker tag "$base" sentinel-gcp-analytics-engine:helmet-before-${stamp}
sudo python3 - "$root" "$stage" <<'PY'
import hashlib,json,pathlib,shutil,sys
root,stage=map(pathlib.Path,sys.argv[1:]); package=stage/'package'; backup=stage/'backup'
for item in json.loads((package/'validation.json').read_text())['files']:
    candidate=package/'source'/item['file']
    if hashlib.sha256(candidate.read_bytes()).hexdigest()!=item['sha256']:raise RuntimeError('Package checksum mismatch')
paths=[p.relative_to(package/'source') for p in (package/'source').rglob('*') if p.is_file()]
paths.extend([pathlib.Path('analytics-engine/models/manifest.json'),pathlib.Path('deploy/gcp/docker-compose.gcp.yml')])
(stage/'backup-state.json').write_text(json.dumps([{'path':str(p),'existed':(root/p).exists()} for p in paths]))
for relative in paths:
    original=root/relative
    if original.exists():
        target=backup/relative; target.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(original,target)
for relative in paths:
    candidate=package/'source'/relative
    if candidate.exists():
        target=root/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(candidate,target)
manifest=root/'analytics-engine/models/manifest.json'; data=json.loads(manifest.read_text());entry=json.loads((package/'head-model-entry.json').read_text())
data['models']=[m for m in data['models'] if m['id']!='helmet-head-evidence']+[entry];manifest.write_text(json.dumps(data,indent=2)+'\\n')
compose=root/'deploy/gcp/docker-compose.gcp.yml';text=compose.read_text()
line='      HELMET_HEAD_EVIDENCE_CAMERAS: "${cameras}"'
if '      HELMET_HEAD_EVIDENCE_CAMERAS:' in text:
    text='\\n'.join(line if row.startswith('      HELMET_HEAD_EVIDENCE_CAMERAS:') else row for row in text.split('\\n'))
else:
    anchor='      HELMET_MULTI_MODEL: "true"'
    if text.count(anchor)!=1:raise RuntimeError('Cannot locate helmet environment safely')
    text=text.replace(anchor,anchor+'\\n'+line)
compose.write_text(text)
PY
sudo tee "$stage/rollback.sh" >/dev/null <<'ROLLBACK'
#!/bin/bash
set -euo pipefail
sudo python3 - <<'PY'
import json,pathlib,shutil
root=pathlib.Path('/opt/sentinel-grid');stage=root/'helmet-head-releases/${stamp}'
for item in json.loads((stage/'backup-state.json').read_text()):
    target=(root/item['path']).resolve()
    if not target.is_relative_to(root):raise RuntimeError('Invalid rollback path')
    if item['existed']:shutil.copy2(stage/'backup'/item['path'],target)
    elif target.is_file():target.unlink()
PY
sudo docker tag sentinel-gcp-analytics-engine:helmet-before-${stamp} sentinel-gcp-analytics-engine:latest
cd /opt/sentinel-grid/deploy/gcp
sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate analytics-engine
ROLLBACK
sudo chmod 700 "$stage/rollback.sh"
printf 'FROM sentinel-gcp-analytics-engine:helmet-before-${stamp}\\nCOPY --chown=analytics:analytics runtime/dist/ /app/dist/\\n' | sudo tee "$stage/package/Dockerfile" >/dev/null
sudo docker build -t sentinel-gcp-analytics-engine:helmet-head-${stamp} "$stage/package"
sudo docker tag sentinel-gcp-analytics-engine:helmet-head-${stamp} sentinel-gcp-analytics-engine:latest
cd "$root/deploy/gcp"
sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate analytics-engine
echo RELEASE_JSON '{"release":"${stamp}","backup":"/opt/sentinel-grid/helmet-head-releases/${stamp}/backup","previousImage":"sentinel-gcp-analytics-engine:helmet-before-${stamp}"}'
`;
const encoded=gzipSync(Buffer.from(remote)).toString('base64');
run('gcloud compute ssh kryptovision-server '+cloud+' --command="echo '+encoded+' | base64 -d | gzip -d | bash"');
