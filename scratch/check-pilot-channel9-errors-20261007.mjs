import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import fs from 'node:fs';
const remote=`set -euo pipefail
sudo docker logs --since 10m --tail 4000 sentinel-gcp-analytics-engine 2>&1 | python3 -c 'import sys,json;s=sys.stdin.read();print(json.dumps({"scope":"analytics last 10m, at most 4000 lines","disposedSessionMessages":s.count("Session already disposed"),"inferenceErrorMessages":s.count("Inference failed"),"invalidEmbeddingMessages":s.count("invalid embedding")}))'
sudo docker logs --since 10m --tail 4000 sentinel-gcp-control-plane 2>&1 | python3 -c 'import sys,json;lines=sys.stdin.read().splitlines();target=[line for line in lines if "e66e3498-1c13-4f59-91d7-5a3386d269d2" in line];print(json.dumps({"scope":"control-plane CH9 last 10m, at most 4000 lines","rejectedFrameMessages":sum("Analytics engine rejected edge frame" in line for line in target),"failedDeliveryMessages":sum("Analytics events were not accepted" in line for line in target)}))'
`;
const encoded=gzipSync(Buffer.from(remote)).toString('base64');
const command='gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '+encoded+' | base64 -d | gzip -d | bash"';
const r=spawnSync(command,{shell:true,encoding:'utf8',timeout:90000});
if(r.stderr)process.stderr.write(r.stderr);if(r.status!==0)throw new Error('Read-only log check failed');
fs.writeFileSync('tmp/pilot-channel9-errors-20261007.log',r.stdout);process.stdout.write(r.stdout);
