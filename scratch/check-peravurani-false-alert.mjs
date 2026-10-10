import { execSync } from 'child_process';
const sql = `
SELECT a.id, a.camera_id, a.title, a.confidence, a.severity, a.status, a.created_at
FROM analytics_alerts a
ORDER BY a.created_at DESC LIMIT 5;


SELECT jsonb_pretty(metadata->'localizedHeads')
FROM analytics_events
WHERE id = 'b335f917-658a-484b-9e09-8df39686c7e8';



`;
const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
