import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const script=`
import {createClient} from 'redis';
import {loadConfig} from '/app/dist/src/config.js';
const r=createClient({url:loadConfig().REDIS_URL});await r.connect();
const cameraId='fb465a8f-5d79-4a3f-9cb8-b8cec471708d';let last;
try {
 for(let i=0;i<24;i++) {
  const raw=await r.get('analytics:latest-frame:'+cameraId);
  if(raw){const sample=JSON.parse(raw);if(sample.capturedAt!==last){last=sample.capturedAt;console.log('RAW_JSON '+JSON.stringify({...sample,cameraId}));}}
  if(i<23)await new Promise(resolve=>setTimeout(resolve,2000));
 }
}finally{await r.quit();}
`;
const command='gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '+Buffer.from(script).toString('base64')+' | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node --input-type=module"';
const result=spawnSync(command,{shell:true,encoding:'utf8',timeout:120000,maxBuffer:48*1024*1024});
if(result.stderr)process.stderr.write(result.stderr);
if(result.status!==0)throw new Error('Read-only frame capture failed: '+result.status);
const root='tmp/kollam-raw-pass-20261007';fs.mkdirSync(root,{recursive:true});const samples=[];
for(const line of result.stdout.split('\n')){
 if(!line.startsWith('RAW_JSON '))continue;
 const row=JSON.parse(line.slice(9)),data=Buffer.from(row.imageBase64,'base64');
 if(data.length!==640*360*3)throw new Error('Unexpected frame dimensions');
 const file=root+'/'+row.capturedAt.replace(/[^0-9]/g,'')+'.rgb';fs.writeFileSync(file,data);
 const preview=file.replace(/\.rgb$/,'.jpg');
 await sharp(data,{raw:{width:640,height:360,channels:3}}).jpeg().toFile(preview);
 samples.push({file,preview,cameraId:row.cameraId,capturedAt:row.capturedAt,width:640,height:360,
  sha256:createHash('sha256').update(data).digest('hex'),groundTruth:'unreviewed'});
}
const output='reports/kollam-raw-pass-'+(samples[0]?.capturedAt.replace(/[^0-9]/g,'')??'empty')+'.json';
fs.writeFileSync(output,JSON.stringify({samples,eventsSubmitted:0},null,2));
console.log(JSON.stringify({output,samples:samples.length,first:samples[0]?.capturedAt,last:samples.at(-1)?.capturedAt,eventsSubmitted:0}));
