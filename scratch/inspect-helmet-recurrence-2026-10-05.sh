set -e
sudo docker exec -i sentinel-gcp-postgres psql -v ON_ERROR_STOP=1 -U sentinel_admin -d sentinel_grid <<'SQL'
SELECT e.id,e.camera_id,e.occurred_at,e.model_version,e.confidence,md5(decode(e.metadata->>'annotatedSnapshotBase64','base64')) AS hash,a.id AS alert_id,a.status
FROM analytics_events e LEFT JOIN analytics_alerts a ON a.event_id=e.id
WHERE e.camera_id='1e17538e-28b2-4963-abb3-3288058d4071' AND e.detection_type='helmet-worn' AND e.occurred_at BETWEEN '2026-10-05 11:50:00+00' AND '2026-10-05 12:10:00+00' ORDER BY e.occurred_at;
SQL
sudo docker exec sentinel-gcp-analytics-engine node --input-type=module -e 'import fs from "node:fs";console.log(fs.readFileSync("/app/dist/analytics-engine/src/detectors/helmet-detector.js","utf8").match(/super\("helmet",[^;]+/g));const h=await(await fetch("http://localhost:8092/health")).json();console.log(JSON.stringify({state:h.aiState,helmet:h.pipeline?.detectors?.helmet,fastAlert:process.env.HELMET_FAST_ALERT}));'
