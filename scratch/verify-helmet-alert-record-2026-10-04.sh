set -e
sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid <<'SQL'
SELECT id,event_id,camera_id,severity,status,title,created_at FROM analytics_alerts WHERE event_id='11647f53-cae0-40a7-80d6-a55eb5ed0f7e';
SELECT n.id,n.channel,n.status,n.attempts,n.created_at FROM analytics_notifications n JOIN analytics_alerts a ON a.id=n.alert_id WHERE a.event_id='11647f53-cae0-40a7-80d6-a55eb5ed0f7e';
SELECT id,version,status,last_seen_at FROM edge_agents WHERE id='aaeda07f-01ce-4361-afd3-a54e4ca114f3';
SQL
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module <<'JS'
import fs from 'node:fs';const s=fs.readFileSync('/app/dist/analytics-engine/src/detectors/helmet-detector.js','utf8');console.log(JSON.stringify({detectorVersion:s.match(/super\("helmet", "([^"]+)"\)/)?.[1]}));
JS
