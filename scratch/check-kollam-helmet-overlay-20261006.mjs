import pg from 'pg';
import {loadConfig} from '/app/dist/src/config.js';
import {PostgresStore} from '/app/dist/src/database/postgres-store.js';
const pool=new pg.Pool({connectionString:loadConfig().DATABASE_URL});
try {
 const store=new PostgresStore(pool),cameraId='fb465a8f-5d79-4a3f-9cb8-b8cec471708d';
 const camera=await store.getCamera(cameraId);
 const node=await store.getNode(camera.branchId);
 const alerts=await store.listAnalyticsAlerts(node.tenantId,{cameraIds:[cameraId],priorityFirst:true,limit:500});
 const open=alerts.filter(a=>!['resolved','false_alarm','suppressed'].includes(a.status));
 console.log('TILE_ALERT_ORDER',JSON.stringify(open.slice(0,6).map(a=>({id:a.id,title:a.title,severity:a.severity,confidence:a.confidence,lastDetectedAt:a.lastDetectedAt,status:a.status}))));
 console.log('HELMET_EVENTS',JSON.stringify((await pool.query(`SELECT id,occurred_at,confidence,model_version,
   metadata->>'evidenceSource' AS evidence_source,status FROM analytics_events
   WHERE camera_id=$1 AND detection_type='helmet-worn' ORDER BY occurred_at DESC LIMIT 5`,[cameraId])).rows));
 console.log('HELMET_DELIVERIES',JSON.stringify((await pool.query(`SELECT n.status,n.channel,n.last_error FROM analytics_notifications n
   JOIN analytics_alerts a ON a.id=n.alert_id WHERE a.camera_id=$1 AND a.title ILIKE '%helmet%' LIMIT 10`,[cameraId])).rows));
} finally {await pool.end();}
