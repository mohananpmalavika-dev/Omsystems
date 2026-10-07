import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const original=fs.readFileSync('scratch/validate-helmet-head-candidate-2026-10-05.sh','utf8');
const ids=[...new Set(original.slice(original.indexOf('WHERE e.id IN'),original.indexOf('), samples AS')).match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g))];
if(ids.length!==19)throw new Error('Unexpected regression corpus');
const script=`
import pg from 'pg';
import {loadConfig} from '/app/dist/src/config.js';
const pool=new pg.Pool({connectionString:loadConfig().DATABASE_URL});
try {
 const rows=(await pool.query("SELECT id,camera_id,occurred_at,metadata->>'snapshotBase64' AS snapshot FROM analytics_events WHERE id=ANY($1::uuid[])",[${JSON.stringify(ids)}])).rows;
 for(const r of rows)if(r.snapshot)console.log('ORIGINAL_JSON '+JSON.stringify(r));
}finally{await pool.end();}
`;
const command='gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '+Buffer.from(script).toString('base64')+' | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node --input-type=module"';
const result=spawnSync(command,{shell:true,encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
if(result.stderr)process.stderr.write(result.stderr);
if(result.status!==0)throw new Error('Read-only original-frame retrieval failed: '+result.status);
const directory='tmp/helmet-permanent-benchmark/negative';fs.mkdirSync(directory,{recursive:true});
const samples=[];
for(const line of result.stdout.split('\n')) {
 if(!line.startsWith('ORIGINAL_JSON '))continue;
 const row=JSON.parse(line.slice(14)),bytes=Buffer.from(row.snapshot.replace(/^data:image\/[^;]+;base64,/,''),'base64');
 const file=directory+'/'+row.id+'.jpg';fs.writeFileSync(file,bytes);
 samples.push({file,expectedHelmet:false,eventId:row.id,cameraId:row.camera_id,occurredAt:row.occurred_at,
  sha256:createHash('sha256').update(bytes).digest('hex'),groundTruthSource:'previously visually verified false-alert regression corpus'});
}
const missing=ids.filter(id=>!samples.some(s=>s.eventId===id));
fs.writeFileSync('reports/helmet-permanent-regression-originals-2026-10-07.json',JSON.stringify({samples,missing},null,2));
console.log(JSON.stringify({originalsRecovered:samples.length,missing:missing.length,eventsSubmitted:0,output:'reports/helmet-permanent-regression-originals-2026-10-07.json'}));
