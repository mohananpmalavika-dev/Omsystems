import { execSync } from 'child_process';

const sql = `
SELECT e.id, c.model as camera_name, e.occurred_at, e.confidence, 
       e.metadata->>'threatType' as threat_type,
       e.metadata->>'evidenceSource' as evidence_source,
       (SELECT json_agg(json_build_object('label', o.label, 'confidence', round(o.confidence::numeric, 2), 'box', o.bounding_box)) 
        FROM detected_objects o WHERE o.event_id = e.id) as objects
FROM analytics_events e
JOIN cameras c ON c.id = e.camera_id
WHERE e.detection_type = 'helmet-worn'
ORDER BY e.occurred_at DESC
LIMIT 10;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
