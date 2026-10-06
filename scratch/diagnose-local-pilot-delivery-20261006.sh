set -eu
sudo docker logs --since 15m sentinel-gcp-control-plane 2>&1 | sudo docker exec -i sentinel-gcp-control-plane node -e '
let raw="";process.stdin.on("data",c=>raw+=c);process.stdin.on("end",()=>{
const requests=new Set(),output=[];
for(const line of raw.split("\n")){let v;try{v=JSON.parse(line);}catch{continue;}
if(v.req?.url?.includes("/edge-agents/e9b95595-1aa6-4a14-9f5d-bd0c958d3f34/analytics/frames"))requests.add(v.reqId);
if(requests.has(v.reqId)||v.cameraId==="26b22c59-b492-434a-aa89-163fff620af1")output.push({time:v.time,msg:v.msg,status:v.res?.statusCode,responseTime:v.responseTime,cameraId:v.cameraId,upstreamStatus:v.upstreamStatus,error:v.err?.message??v.error?.message});}
console.log("FRAME_DELIVERY_LOGS",JSON.stringify(output.slice(-60)));});'
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module <<'JS'
import fs from 'node:fs';
const h=await(await fetch('http://localhost:8092/health')).json();
const code=fs.readFileSync('/app/dist/analytics-engine/src/detectors/helmet-detector.js','utf8');
console.log('HEALTH',JSON.stringify({checkedAt:new Date().toISOString(),aiState:h.aiState,notifications:h.notifications,helmet:h.pipeline?.detectors?.helmet,object:h.pipeline?.detectors?.object,person:h.pipeline?.detectors?.person,version:code.match(/super\("helmet", "([^"]+)"\)/)?.[1],helmetThreshold:process.env.HELMET_CONFIDENCE_THRESHOLD??'default',fastAlert:process.env.HELMET_FAST_ALERT??'default'}));
JS
