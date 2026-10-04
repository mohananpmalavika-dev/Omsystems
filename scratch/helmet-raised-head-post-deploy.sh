set -e
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module <<'JS'
import fs from 'node:fs';const h=await(await fetch('http://localhost:8092/health')).json();console.log(JSON.stringify({aiState:h.aiState,received:h.received,failed:h.failed,lastAcceptedAt:h.lastAcceptedAt,helmet:h.pipeline?.detectors?.helmet,notifications:h.notifications,version:fs.readFileSync('/app/dist/analytics-engine/src/detectors/helmet-detector.js','utf8').match(/super\("helmet", "([^"]+)"\)/)?.[1]}));
JS
sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid <<'SQL'
SELECT now();
SELECT n.name,e.id,e.confidence,e.status,e.rejection_reason,e.model_version,e.occurred_at FROM analytics_events e JOIN cameras c ON c.id=e.camera_id JOIN resource_nodes n ON n.id=c.resource_node_id WHERE c.branch_node_id='00000000-0000-4000-8000-000000000104' AND e.detection_type='helmet-worn' AND e.occurred_at>now()-interval '10 minutes' ORDER BY e.occurred_at DESC LIMIT 5;
SELECT a.id,a.event_id,n.name,a.confidence,a.model_version,a.created_at FROM analytics_alerts a JOIN cameras c ON c.id=a.camera_id JOIN resource_nodes n ON n.id=c.resource_node_id WHERE c.branch_node_id='00000000-0000-4000-8000-000000000104' AND a.title ILIKE '%helmet%' AND a.created_at>now()-interval '10 minutes' ORDER BY a.created_at DESC LIMIT 5;
SQL
