set -e
sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid <<'SQL'
SELECT c.id,n.name,c.channel,max(e.occurred_at) AS latest_frame_event FROM cameras c JOIN resource_nodes n ON n.id=c.resource_node_id LEFT JOIN analytics_events e ON e.camera_id=c.id AND e.occurred_at>now()-interval '30 minutes' WHERE c.branch_node_id='00000000-0000-4000-8000-000000000104' GROUP BY c.id,n.name ORDER BY n.name;
SELECT a.id,a.event_id,n.name,a.confidence,a.created_at FROM analytics_alerts a JOIN cameras c ON c.id=a.camera_id JOIN resource_nodes n ON n.id=c.resource_node_id WHERE c.branch_node_id='00000000-0000-4000-8000-000000000104' AND a.title ILIKE '%helmet%' ORDER BY a.created_at DESC LIMIT 10;
SQL
sudo docker exec -i sentinel-gcp-control-plane node <<'JS'
const {createClient}=require('redis');(async()=>{const c=createClient({url:process.env.REDIS_URL,socket:{connectTimeout:5000,reconnectStrategy:false}});c.on('error',()=>{});await c.connect();for await(const batch of c.scanIterator({MATCH:'analytics:latest-frame:*',COUNT:100})){for(const key of Array.isArray(batch)?batch:[batch]){const raw=await c.get(key);const f=raw?JSON.parse(raw):null;console.log(JSON.stringify({key,capturedAt:f?.capturedAt,ageSeconds:f?(Date.now()-Date.parse(f.capturedAt))/1000:null}));}}await c.quit();})().catch(e=>{console.error(e.message);process.exit(1)});
JS
