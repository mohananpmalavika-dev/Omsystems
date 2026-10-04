set -e
sudo docker ps --format '{{.Names}} {{.Status}}' | grep -E 'analytics|control-plane|redis'
sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid <<'SQL'
SELECT id,name,version,status,last_seen_at FROM edge_agents WHERE id='aaeda07f-01ce-4361-afd3-a54e4ca114f3';
SELECT id,command_type,status,requested_at,completed_at,error FROM edge_commands WHERE edge_agent_id='aaeda07f-01ce-4361-afd3-a54e4ca114f3' ORDER BY requested_at DESC LIMIT 5;
SQL
sudo docker exec -i sentinel-gcp-control-plane node <<'JS'
const {createClient}=require('redis');(async()=>{const c=createClient({url:process.env.REDIS_URL,socket:{connectTimeout:5000,reconnectStrategy:false}});c.on('error',()=>{});await c.connect();for(const id of ['5a114643-b80e-4872-8067-376fed66e8bd','0494e750-b4b2-49a6-9dbc-9d97a086df1f','af9e87de-714a-4175-8162-096e89cffc13']){const raw=await c.get('analytics:latest-frame:'+id);console.log(JSON.stringify({id,ttl:await c.ttl('analytics:latest-frame:'+id),capturedAt:raw?JSON.parse(raw).capturedAt:null}));}await c.quit();})().catch(e=>{console.error(e.message);process.exit(1)});
JS
