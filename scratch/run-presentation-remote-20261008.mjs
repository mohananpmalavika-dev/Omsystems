import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const [container, file, output] = process.argv.slice(2);
if (!['sentinel-gcp-control-plane', 'sentinel-gcp-analytics-engine'].includes(container)) throw Error('Invalid container');
const code=fs.readFileSync(file);
const remote=`echo ${code.toString('base64')} | base64 -d | sudo docker exec -i ${container} node --input-type=module`;
const command=`gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="${remote}"`;
const result=spawnSync(command,{shell:true,encoding:'utf8',timeout:90000,maxBuffer:5*1024*1024});
if(output && result.status===0)fs.writeFileSync(output,result.stdout);
process.stdout.write(result.stdout||'');
if(result.status!==0){process.stderr.write(result.stderr||String(result.error));process.exitCode=1;}
