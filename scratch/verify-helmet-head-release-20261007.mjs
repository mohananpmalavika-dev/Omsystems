import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const paths=['detectors/helmet-detector.js','inference/configured-model-inference.js','inference/helmet-head-verification.js',
 'inference/helmet-head-classification.js','inference/helmet-head-probe.js','model-manager.js'];
const script=`import fs from 'node:fs';import {createHash} from 'node:crypto';
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const health=await(await fetch('http://localhost:8092/health')).json();
const {HELMET_HEAD_PROBE_SHA256}=await import('/app/dist/analytics-engine/src/inference/helmet-head-probe.js');
console.log('RELEASE_VERIFY '+JSON.stringify({checkedAt:new Date().toISOString(),aiState:health.aiState,
 version:fs.readFileSync('/app/dist/analytics-engine/src/detectors/helmet-detector.js','utf8').includes('super("helmet", "1.3.1")')?'1.3.1':'unexpected',
 helmet:health.pipeline?.detectors?.helmet,cameras:process.env.HELMET_HEAD_EVIDENCE_CAMERAS,
 probeSha256:HELMET_HEAD_PROBE_SHA256,modelSha256:hash('/app/models/safety/helmet-head-embedding.onnx'),
 runtime:${JSON.stringify(paths)}.map(p=>({file:p,sha256:hash('/app/dist/analytics-engine/src/'+p)}))}));`;
const command='gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '+Buffer.from(script).toString('base64')+' | base64 -d | sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module"';
const r=spawnSync(command,{shell:true,encoding:'utf8',timeout:90000});
if(r.stderr)process.stderr.write(r.stderr);
if(r.status!==0)throw new Error('Release verification failed');
const line=r.stdout.split('\n').find(l=>l.startsWith('RELEASE_VERIFY '));
if(!line)throw new Error('Missing release verification');
const result=JSON.parse(line.slice(15));
for(const item of result.runtime){
 const expected=createHash('sha256').update(fs.readFileSync('analytics-engine/dist/analytics-engine/src/'+item.file)).digest('hex');
 if(item.sha256!==expected)throw new Error('Runtime differs from local candidate: '+item.file);
}
if(result.modelSha256!=='583fd1110a514667812fee7d684952aaf82a99b959760c8d7dca7e0ab9839299')throw new Error('Unexpected deployed feature model');
if(result.helmet?.status!=='healthy')throw new Error('Helmet detector is not healthy');
if(result.cameras!=='*')throw new Error('Complete-head evidence is not enabled for all cameras');
if(result.version!=='1.3.1')throw new Error('Unexpected deployed helmet detector version');
fs.writeFileSync('reports/helmet-head-evidence-all-cameras-release-2026-10-07.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
