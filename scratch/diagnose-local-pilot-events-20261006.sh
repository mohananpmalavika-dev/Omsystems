set -eu
sudo docker exec -i sentinel-gcp-control-plane node --input-type=module <<'JS'
import pg from 'pg';import {createClient} from 'redis';
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
const redis=createClient({url:process.env.REDIS_URL});await redis.connect();
try{
const id='26b22c59-b492-434a-aa89-163fff620af1';
console.log('CHECKED_AT',new Date().toISOString());
console.log('RULE',JSON.stringify((await db.query(`SELECT detection_type,enabled,min_confidence,min_duration_seconds,cooldown_seconds,schedule,archived_at FROM analytics_rules WHERE camera_id=$1 AND detection_type='helmet-worn'`,[id])).rows));
console.log('EVENTS',JSON.stringify((await db.query(`SELECT id,detection_type,occurred_at,confidence,model_version,status FROM analytics_events WHERE camera_id=$1 AND occurred_at>now()-interval '30 minutes' ORDER BY occurred_at DESC LIMIT 15`,[id])).rows));
console.log('ALERTS',JSON.stringify((await db.query(`SELECT id,title,created_at,confidence,status FROM analytics_alerts WHERE camera_id=$1 AND created_at>now()-interval '30 minutes' ORDER BY created_at DESC LIMIT 15`,[id])).rows));
const raw=await redis.get(`analytics:latest-frame:${id}`);
console.log('CACHE',JSON.stringify({ttl:await redis.ttl(`analytics:latest-frame:${id}`),capturedAt:raw?JSON.parse(raw).capturedAt:null}));
}finally{await redis.quit();await db.end();}
JS
