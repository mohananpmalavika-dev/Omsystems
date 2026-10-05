import { execSync } from 'child_process';

const sql = `
SELECT json_build_object(
  'alert_id', a.id,
  'camera_id', a.camera_id,
  'rule_id', a.rule_id,
  'event_id', a.event_id,
  'title', a.title,
  'event_detection_type', e.detection_type,
  'event_metadata', e.metadata
)
FROM analytics_alerts a
LEFT JOIN analytics_events e ON a.event_id = e.id
WHERE a.title ILIKE '%known person%'
ORDER BY a.first_detected_at DESC LIMIT 1;
`;
const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -t"`;
const out = execSync(cmd, { encoding: 'utf8' }).trim();
const parsed = JSON.parse(out);
console.log('Detection Type:', parsed.event_detection_type);
console.log('Title:', parsed.title);
console.log('Metadata keys:', Object.keys(parsed.event_metadata || {}));
console.log('identityMatch:', parsed.event_metadata?.identityMatch);
console.log('faceMatch:', parsed.event_metadata?.faceMatch);
