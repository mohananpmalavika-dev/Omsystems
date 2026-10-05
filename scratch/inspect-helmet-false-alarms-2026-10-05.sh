set -e
sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid <<'SQL'
SELECT e.id,e.camera_id,e.occurred_at,e.confidence,e.model_version,e.metadata->'objects' AS objects,e.metadata->>'evidenceSource' AS evidence_source,a.id AS alert_id,a.status,a.title FROM analytics_events e LEFT JOIN analytics_alerts a ON a.event_id=e.id WHERE e.detection_type='helmet-worn' AND e.occurred_at BETWEEN '2026-10-05 07:00:00+00' AND '2026-10-05 08:00:00+00' ORDER BY e.occurred_at;
SQL
sudo docker exec sentinel-gcp-analytics-engine node --input-type=module -e 'import fs from "node:fs";const s=fs.readFileSync("/app/dist/analytics-engine/src/detectors/helmet-detector.js","utf8");console.log(s.match(/super\("helmet",[^;]+/g));const h=await(await fetch("http://localhost:8092/health")).json();console.log(JSON.stringify({state:h.aiState,helmet:h.pipeline?.detectors?.helmet}));'
