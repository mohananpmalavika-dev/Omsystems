set -eu
sudo docker exec -i sentinel-gcp-control-plane node --input-type=module <<'JS'
import pg from 'pg';
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
try {
const alerts=(await db.query(`SELECT a.id,a.camera_id,c.channel,a.title,a.created_at,a.confidence,a.status,a.incident_id
 FROM analytics_alerts a JOIN cameras c ON c.id=a.camera_id
 WHERE c.branch_node_id='00000000-0000-4000-8000-000000000104'
 AND a.title ILIKE '%helmet%' AND a.created_at>now()-interval '30 minutes' ORDER BY a.created_at`)).rows;
console.log('ALERT_DELIVERY',JSON.stringify({checkedAt:new Date().toISOString(),alerts}));
const ids=alerts.map(a=>a.id);
console.log('ANALYTICS_NOTIFICATIONS',JSON.stringify((await db.query(`SELECT alert_id,channel,status,created_at FROM analytics_notifications WHERE alert_id=ANY($1::uuid[]) ORDER BY created_at`,[ids])).rows));
console.log('DURABLE_NOTIFICATIONS',JSON.stringify((await db.query(`SELECT alert_id,channel,status,attempts,created_at,sent_at,delivered_at FROM notification_jobs WHERE alert_id=ANY($1::text[]) ORDER BY created_at`,[ids])).rows));
}finally {await db.end();}
JS
sudo docker logs --since 10m sentinel-gcp-control-plane 2>&1 | sudo docker exec -i sentinel-gcp-control-plane node -e '
let raw="";process.stdin.on("data",c=>raw+=c);process.stdin.on("end",()=>{
const requests=new Set(),output=[];
for(const line of raw.split("\n")){let v;try{v=JSON.parse(line);}catch{continue;}
const url=v.req?.url;
if(url && (url.includes("/v1/alerts/events")||url.includes("/v1/alerts/command-center")||url.includes("/v1/alerts/alert-center"))) {requests.add(v.reqId);output.push({time:v.time,msg:v.msg,path:url.split("?")[0]});}
if(requests.has(v.reqId)&&v.res) output.push({time:v.time,msg:v.msg,status:v.res.statusCode});
}
console.log("BROWSER_DELIVERY_REQUESTS",JSON.stringify(output.slice(-40)));});'
