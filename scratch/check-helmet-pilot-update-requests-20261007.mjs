import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import fs from 'node:fs';
const py="import sys,re,json\nrows=sys.stdin.read().splitlines()\nevents=[]\nfor line in rows:\n kind=None\n if 'e9b95595-1aa6-4a14-9f5d-bd0c958d3f34' in line and '/updates/next' in line:kind='pilot-update-poll'\n elif '/edge-updates/artifacts/0.1.49/edge-agent.bundle' in line:kind='patch-artifact-request'\n elif 'e9b95595-1aa6-4a14-9f5d-bd0c958d3f34' in line and '/heartbeat' in line:kind='pilot-heartbeat-request'\n if kind:\n  timestamp=re.search(r'\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d(?:\\.\\d+)?Z',line)\n  version=re.search(r'version=([0-9.]+)',line)\n  events.append({'kind':kind,'timestamp':timestamp.group(0) if timestamp else None,'version':version.group(1) if version else None})\nprint(json.dumps({'counts':{kind:sum(e['kind']==kind for e in events) for kind in ['pilot-update-poll','patch-artifact-request','pilot-heartbeat-request']},'latest':events[-16:]}))\n";
const script='sudo docker logs --since 25m --tail 18000 sentinel-gcp-control-plane 2>&1 | python3 -c "import base64;exec(base64.b64decode(\''+Buffer.from(py).toString('base64')+'\'))"';
const command='echo '+gzipSync(Buffer.from(script)).toString('base64')+' | base64 -d | gzip -d | bash';
const r=spawnSync('gcloud',['compute','ssh','kryptovision-server','--zone=asia-south1-b','--project=project-7866fc3f-5dd5-4495-804','--quiet','--command="'+command+'"'],{shell:process.platform==='win32',encoding:'utf8',timeout:90000,maxBuffer:1024*1024});
if(r.status!==0)throw new Error('Read-only log check failed');
fs.writeFileSync('tmp/helmet-pilot-update-requests-20261007.json',r.stdout);console.log(r.stdout);
