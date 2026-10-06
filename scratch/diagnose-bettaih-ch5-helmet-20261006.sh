#!/usr/bin/env bash
# Read-only diagnostics for the camera shown in the user's screenshot.
# No snapshots, faces, raw frames, credentials, or unrelated camera events.
set -eu
sudo docker exec -i sentinel-gcp-postgres psql -v ON_ERROR_STOP=1 -U sentinel_admin -d sentinel_grid <<'SQL'
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
SELECT now() AS checked_at;
SELECT c.id, c.recorder_channel, r.detection_type, r.enabled,
       r.min_confidence, r.min_duration_seconds, r.archived_at
FROM cameras c LEFT JOIN analytics_rules r ON r.camera_id=c.id
WHERE c.branch_node_id='d7b23dee-9814-48c9-8805-48b61b33e3a9'
  AND c.recorder_channel=5;
SELECT e.detection_type, e.status, e.model_version, count(*) AS event_count,
       max(e.occurred_at) AS latest_event
FROM analytics_events e JOIN cameras c ON c.id=e.camera_id
WHERE c.branch_node_id='d7b23dee-9814-48c9-8805-48b61b33e3a9'
  AND c.recorder_channel=5 AND e.occurred_at > now()-interval '2 hours'
GROUP BY e.detection_type,e.status,e.model_version;
SELECT a.status, count(*) AS helmet_alert_count, max(a.created_at) AS latest_alert
FROM analytics_alerts a JOIN cameras c ON c.id=a.camera_id
WHERE c.branch_node_id='d7b23dee-9814-48c9-8805-48b61b33e3a9'
  AND c.recorder_channel=5 AND a.title ILIKE '%helmet%'
  AND a.created_at > now()-interval '2 hours'
GROUP BY a.status;
COMMIT;
SQL
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module <<'JS'
import fs from 'node:fs';
const health=await (await fetch('http://localhost:8092/health')).json();
const code=fs.readFileSync('/app/dist/analytics-engine/src/detectors/helmet-detector.js','utf8');
console.log(JSON.stringify({aiState:health.aiState,
  helmet:health.pipeline?.detectors?.helmet,notifications:health.notifications,
  version:code.match(/super\("helmet", "([^"]+)"\)/)?.[1]}));
JS
