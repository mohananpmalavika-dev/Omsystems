set -e
sudo docker exec -i sentinel-gcp-postgres psql -v ON_ERROR_STOP=1 -U sentinel_admin -d sentinel_grid <<'SQL'
SELECT e.id,e.camera_id,n.name AS camera_name,e.occurred_at,e.detection_type,e.confidence,e.model_version,e.metadata->'objects' AS objects,e.metadata->>'evidenceSource' AS evidence_source,a.id AS alert_id,a.status,a.title
FROM analytics_events e LEFT JOIN cameras c ON c.id=e.camera_id LEFT JOIN resource_nodes n ON n.id=c.resource_node_id LEFT JOIN analytics_alerts a ON a.event_id=e.id
WHERE e.occurred_at BETWEEN '2026-10-05 10:35:00+00' AND '2026-10-05 11:15:00+00'
AND (n.name ILIKE '%BETT%' OR e.detection_type='helmet-worn') ORDER BY e.occurred_at LIMIT 150;
SQL
sudo docker exec sentinel-gcp-analytics-engine node --input-type=module -e 'import fs from "node:fs";const s=fs.readFileSync("/app/dist/analytics-engine/src/detectors/helmet-detector.js","utf8");console.log(s.match(/super\("helmet",[^;]+/g));const h=await(await fetch("http://localhost:8092/health")).json();console.log(JSON.stringify({state:h.aiState,helmet:h.pipeline?.detectors?.helmet,fastAlert:process.env.HELMET_FAST_ALERT}));'
