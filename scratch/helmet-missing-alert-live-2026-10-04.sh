set -e
sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid <<'SQL'
SELECT now();
SELECT id,name,version,status,last_seen_at FROM edge_agents WHERE id='aaeda07f-01ce-4361-afd3-a54e4ca114f3';
SELECT c.id,c.recorder_channel,r.detection_type,r.enabled,r.min_confidence,r.min_duration_seconds FROM cameras c JOIN analytics_rules r ON r.camera_id=c.id WHERE c.branch_node_id='00000000-0000-4000-8000-000000000104' AND r.detection_type LIKE '%helmet%' ORDER BY c.recorder_channel;
SELECT c.recorder_channel,e.id,e.detection_type,e.status,e.rejection_reason,e.confidence,e.occurred_at FROM analytics_events e JOIN cameras c ON c.id=e.camera_id WHERE c.branch_node_id='00000000-0000-4000-8000-000000000104' AND e.occurred_at>now()-interval '45 minutes' ORDER BY e.occurred_at DESC LIMIT 25;
SELECT column_name FROM information_schema.columns WHERE table_name IN ('analytics_alerts','notifications') ORDER BY table_name,ordinal_position;
SQL
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module <<'JS'
import fs from 'node:fs';
const h=await(await fetch('http://localhost:8092/health')).json();console.log('HEALTH',JSON.stringify(h));
console.log('DETECTOR_VERSION',fs.readFileSync('/app/dist/analytics-engine/src/detectors/helmet-detector.js','utf8').match(/super\("helmet", "([^"]+)"\)/)?.[1]);
JS
sudo docker exec -i sentinel-gcp-control-plane node <<'JS'
const {createClient}=require('redis');(async()=>{const c=createClient({url:process.env.REDIS_URL,socket:{connectTimeout:5000,reconnectStrategy:false}});c.on('error',()=>{});await c.connect();for(const [channel,id] of [[2,'5a114643-b80e-4872-8067-376fed66e8bd'],[6,'0494e750-b4b2-49a6-9dbc-9d97a086df1f'],[8,'af9e87de-714a-4175-8162-096e89cffc13']]){const raw=await c.get('analytics:latest-frame:'+id);console.log('FRAME',JSON.stringify({channel,id,ttl:await c.ttl('analytics:latest-frame:'+id),capturedAt:raw?JSON.parse(raw).capturedAt:null}));}await c.quit();})().catch(e=>{console.error(e.message);process.exit(1)});
JS
sudo docker logs --since 15m sentinel-gcp-analytics-engine 2>&1 | tail -40
