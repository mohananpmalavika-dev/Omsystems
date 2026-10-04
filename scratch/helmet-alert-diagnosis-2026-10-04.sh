set -e
sudo docker ps --format '{{.Names}} {{.Status}}' | grep -E 'analytics|control-plane|postgres'
sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid <<'SQL'
SELECT c.id,c.recorder_channel,c.branch_node_id,r.detection_type,r.enabled,r.min_confidence,r.min_duration_seconds,r.archived_at FROM cameras c JOIN analytics_rules r ON r.camera_id=c.id WHERE c.branch_node_id='00000000-0000-4000-8000-000000000104' AND r.detection_type LIKE '%helmet%' ORDER BY c.recorder_channel;
SELECT c.recorder_channel,e.detection_type,e.status,e.rejection_reason,count(*),max(e.occurred_at) FROM analytics_events e JOIN cameras c ON c.id=e.camera_id WHERE c.branch_node_id='00000000-0000-4000-8000-000000000104' AND e.occurred_at > now()-interval '2 hours' GROUP BY 1,2,3,4 ORDER BY 1,2;
SQL
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module <<'JS'
import fs from 'node:fs';
const h=await (await fetch('http://localhost:8092/health')).json();
console.log('HEALTH',JSON.stringify(h));
const code=fs.readFileSync('/app/dist/analytics-engine/src/detectors/helmet-detector.js','utf8');
console.log('DETECTOR',JSON.stringify({version:code.match(/super\("helmet", "([^"]+)"\)/)?.[1],strongPersonGate:code.includes('CLASSIFIED_PERSON_CONFIDENCE')}));
const manifest=JSON.parse(fs.readFileSync('/app/models/manifest.json','utf8'));
console.log('HELMET MODEL',JSON.stringify(manifest.models?.filter(m=>m.id==='helmet')??manifest.helmet));
JS
