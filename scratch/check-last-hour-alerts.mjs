import { execSync } from 'child_process';

const sql = `
SELECT a.id, a.camera_id, c.model as camera_name, a.title, a.first_detected_at, a.confidence,
       e.metadata->>'evidenceSource' as evidence_source,
       (SELECT json_agg(json_build_object('label', o.label, 'confidence', round(o.confidence::numeric, 2), 'box', o.bounding_box)) 
        FROM detected_objects o WHERE o.event_id::text = a.event_id::text) as objects
FROM analytics_alerts a
LEFT JOIN analytics_events e ON a.event_id::text = e.id::text
LEFT JOIN cameras c ON c.id = a.camera_id
WHERE a.created_at >= NOW() - interval '1 hour'
ORDER BY a.created_at DESC;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
