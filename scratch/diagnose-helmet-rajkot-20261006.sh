#!/usr/bin/env bash
set -eu
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module <<'JS'
import fs from 'node:fs';
const h=await(await fetch('http://localhost:8092/health')).json();
const code=fs.readFileSync('/app/dist/analytics-engine/src/detectors/helmet-detector.js','utf8');
console.log(JSON.stringify({aiState:h.aiState,helmet:h.pipeline?.detectors?.helmet,notifications:h.notifications,version:code.match(/super\("helmet", "([^"]+)"\)/)?.[1]}));
JS
sudo docker exec -i sentinel-gcp-postgres psql -v ON_ERROR_STOP=1 -U sentinel_admin -d sentinel_grid <<'SQL'
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT e.id,e.camera_id,e.occurred_at,e.detection_type,e.model_version,e.confidence,
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(e.metadata) WHERE key NOT ILIKE '%base64%') AS metadata
FROM analytics_events e JOIN cameras c ON c.id=e.camera_id JOIN resource_nodes b ON b.id=c.branch_node_id
WHERE b.name ILIKE '%rajkot%' AND e.detection_type IN ('helmet','helmet-worn') AND e.occurred_at > now()-interval '6 hours'
ORDER BY e.occurred_at DESC LIMIT 8;
SELECT a.id,a.camera_id,a.created_at,a.status,a.title FROM analytics_alerts a JOIN cameras c ON c.id=a.camera_id
JOIN resource_nodes b ON b.id=c.branch_node_id WHERE b.name ILIKE '%rajkot%' AND a.title ILIKE '%helmet%'
AND a.created_at > now()-interval '6 hours' ORDER BY a.created_at DESC LIMIT 8;
COMMIT;
SQL
