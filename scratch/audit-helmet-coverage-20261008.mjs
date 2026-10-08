import { spawnSync } from 'node:child_process';

const audit = `
import pg from 'pg';
import { createClient } from 'redis';
const db = new pg.Client({connectionString:process.env.DATABASE_URL});
const redis = createClient({url:process.env.REDIS_URL});
redis.on('error',()=>{});
await db.connect();
await redis.connect();
try {
 const cameras=(await db.query(\`
 SELECT c.id, c.status, rn.name,
 EXISTS(SELECT 1 FROM analytics_rules r WHERE r.camera_id=c.id
 AND r.detection_type='helmet-worn' AND r.enabled=true
 AND (to_jsonb(r)->>'archived_at') IS NULL) AS helmet_enabled
 FROM cameras c JOIN resource_nodes rn ON rn.id=c.resource_node_id
 WHERE rn.is_active=true ORDER BY rn.name
 \`)).rows;
 const now=Date.now();
 const summary={checkedAt:new Date(now).toISOString(),activeCameras:cameras.length,
 enabledHelmetCameras:0,onlineHelmetCameras:0,freshHelmetFrames:0,
 missingRule:[],staleOrMissingFrames:[]};
 for(const c of cameras){
  if(!c.helmet_enabled){summary.missingRule.push({id:c.id,name:c.name,status:c.status});continue;}
  summary.enabledHelmetCameras++;
  if(String(c.status).toLowerCase()==='online')summary.onlineHelmetCameras++;
  const raw=await redis.get('analytics:latest-frame:'+c.id);
  let age=null;
  if(raw){try{age=(now-new Date(JSON.parse(raw).capturedAt).getTime())/1000;}catch{}}
  if(age!==null && Number.isFinite(age) && age>=-5 && age<=90)summary.freshHelmetFrames++;
  else summary.staleOrMissingFrames.push({id:c.id,name:c.name,status:c.status,frameAgeSeconds:age});
 }
 summary.recentAlerts=(await db.query(\`
 SELECT camera_id, count(*)::int AS alerts, max(created_at) AS latest_alert
 FROM analytics_alerts WHERE title ILIKE '%helmet%'
 AND created_at>now()-interval '24 hours'
 GROUP BY camera_id ORDER BY latest_alert DESC
 \`)).rows;
 console.log(JSON.stringify(summary,null,2));
}finally{await redis.quit();await db.end();}
`;
const health = `import fs from 'node:fs';
const h=await(await fetch('http://localhost:8092/health')).json();
const source=fs.readFileSync('/app/dist/analytics-engine/src/detectors/helmet-detector.js','utf8');
console.log(JSON.stringify({checkedAt:new Date().toISOString(),aiState:h.aiState,
helmet:h.pipeline?.detectors?.helmet,headEvidenceCameras:process.env.HELMET_HEAD_EVIDENCE_CAMERAS,
version:source.match(/super\\("helmet",\\s*"([^"]+)"\\)/)?.[1]},null,2));`;
for (const [container, script] of [['sentinel-gcp-analytics-engine',health],['sentinel-gcp-control-plane',audit]]) {
 const remote=`echo ${Buffer.from(script).toString('base64')} | base64 -d | sudo docker exec -i ${container} node --input-type=module`;
 const result=spawnSync('gcloud',['compute','ssh','kryptovision-server','--zone=asia-south1-b','--project=project-7866fc3f-5dd5-4495-804','--quiet',`--command="${remote}"`],{shell:true,encoding:'utf8',timeout:55000});
 process.stdout.write(result.stdout||'');
 if(result.status!==0){process.stderr.write(result.stderr||String(result.error));process.exitCode=1;break;}
}
