import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
function remote(command){const r=spawnSync('gcloud.cmd',['compute','ssh','kryptovision-server','--zone=asia-south1-b','--project=project-7866fc3f-5dd5-4495-804','--quiet','--command='+JSON.stringify(command)],{shell:true,encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024});if(r.status!==0)throw Error('Read-only log check failed');return r.stdout;}
const result={from:'2026-10-08T04:35:00Z',to:'2026-10-08T04:41:00Z',containers:{}};
for(const container of ['sentinel-gcp-analytics-engine','sentinel-gcp-control-plane']){
 const raw=remote('sudo docker logs --timestamps --since 2026-10-08T04:35:00Z --until 2026-10-08T04:41:00Z '+container+' 2>&1');
 const lines=raw.split('\n'),disposed=lines.filter(l=>/Session already disposed/i.test(l));
 const error500=lines.filter(l=>/statusCode["\s:]+500|HTTP 500|frame.*failed|inference.*failed/i.test(l));
 const cameraLines=lines.filter(l=>/4a2f17b5-08e9-401a-84f6-6489c41970f9|d02f79e9-0615-4df6-a604-d3e4b8bde9b2/.test(l));
 result.containers[container]={lineCount:lines.length,disposedErrors:disposed.length,failedRequests:error500.length,cameraLines:cameraLines.length,
 disposedTimes:disposed.map(l=>l.slice(0,30)).slice(0,10),firstLineTime:lines[0]?.slice(0,30),lastLineTime:lines.filter(Boolean).at(-1)?.slice(0,30)};
}
fs.writeFileSync('reports/bettiah-entry-analytics-errors-2026-10-08.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
