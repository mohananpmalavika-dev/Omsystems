import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const command='sudo docker logs --timestamps --since 2026-10-08T04:35:00Z --until 2026-10-08T04:41:00Z sentinel-gcp-control-plane 2>&1';
const r=spawnSync('gcloud.cmd',['compute','ssh','kryptovision-server','--zone=asia-south1-b','--project=project-7866fc3f-5dd5-4495-804','--quiet','--command='+JSON.stringify(command)],{shell:true,encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024});
if(r.status!==0)throw Error('Log retrieval failed');
const report={};
for(const id of ['4a2f17b5-08e9-401a-84f6-6489c41970f9','d02f79e9-0615-4df6-a604-d3e4b8bde9b2']){
 const records=[];
 for(const line of r.stdout.split('\n')){if(!line.includes(id))continue;const brace=line.indexOf('{');if(brace<0)continue;try{const j=JSON.parse(line.slice(brace));const url=j.req?.url||j.url||'';if(!/analytics|frame/.test(url)&&!/analytics|frame/i.test(j.msg||''))continue;records.push({at:line.slice(0,30),msg:j.msg,requestId:j.reqId,method:j.req?.method,url:url.split('?')[0],status:j.res?.statusCode,responseTime:j.responseTime});}catch{}}
 report[id]=records;
}
fs.writeFileSync('reports/bettiah-entry-frame-requests-2026-10-08.json',JSON.stringify(report,null,2));
for(const [id,records] of Object.entries(report))console.log(JSON.stringify({id,requests:records.length,samples:records.slice(0,8),tail:records.slice(-8)}));
