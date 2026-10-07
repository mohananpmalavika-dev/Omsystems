import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const script=`import {createRequire} from 'node:module';const {Pool}=createRequire('/app/package.json')('pg');
import {loadConfig} from '/app/dist/src/config.js';const pool=new Pool({connectionString:loadConfig().DATABASE_URL});
try {
 const rows=(await pool.query("SELECT id,camera_id,occurred_at,confidence,model_version,metadata->>'headEvidenceModel' AS head_model,metadata->>'headEvidenceProbeSha256' AS probe_sha256,metadata->>'evidenceSource' AS evidence_source,metadata->>'snapshotBase64' AS snapshot FROM analytics_events WHERE camera_id=ANY($1::uuid[]) AND detection_type='helmet-worn' AND model_version='1.3.0' ORDER BY occurred_at DESC LIMIT 8",[['3da93c6e-6824-43dc-9bba-7332707d5856','fb465a8f-5d79-4a3f-9cb8-b8cec471708d']])).rows;
 for(const row of rows){const encoded=row.snapshot??'';delete row.snapshot;for(let offset=0;offset<encoded.length;offset+=16000)console.log('ALERT_IMAGE '+JSON.stringify({id:row.id,offset,data:encoded.slice(offset,offset+16000)}));console.log('ALERT_EVENT '+JSON.stringify(row));}
}finally{await pool.end();}`;
const command='gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '+Buffer.from(script).toString('base64')+' | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node --input-type=module"';
const r=spawnSync(command,{shell:true,encoding:'utf8',timeout:90000,maxBuffer:10*1024*1024});
if(r.stderr)process.stderr.write(r.stderr);if(r.status!==0)throw new Error('Live alert retrieval failed');
const images=new Map(),events=[];
for(const line of r.stdout.split('\n')) {
 if(line.startsWith('ALERT_IMAGE ')){const chunk=JSON.parse(line.slice(12));const chunks=images.get(chunk.id)??[];chunks.push(chunk);images.set(chunk.id,chunks);}
 if(line.startsWith('ALERT_EVENT '))events.push(JSON.parse(line.slice(12)));
}
for(const event of events){const chunks=(images.get(event.id)??[]).sort((a,b)=>a.offset-b.offset);let encoded='';
 for(const chunk of chunks){if(chunk.offset!==encoded.length)throw new Error('Missing image chunk');encoded+=chunk.data;}
 if(encoded){const data=Buffer.from(encoded.replace(/^data:image\/[^;]+;base64,/,''),'base64');event.snapshot='tmp/helmet-head-live-alert-'+event.id+'.jpg';event.snapshotSha256=createHash('sha256').update(data).digest('hex');fs.writeFileSync(event.snapshot,data);}
}
fs.writeFileSync('reports/kollam-head-evidence-live-alerts-2026-10-07.json',JSON.stringify({checkedAt:new Date().toISOString(),events},null,2));
console.log(JSON.stringify(events,null,2));
