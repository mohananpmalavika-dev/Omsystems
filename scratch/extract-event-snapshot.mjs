import { execSync } from 'child_process';
import fs from 'fs';

const sql = `SELECT metadata->>'snapshotBase64' FROM analytics_events WHERE id = 'b335f917-658a-484b-9e09-8df39686c7e8';`;
const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -t -A"`;

const res = execSync(cmd, { maxBuffer: 50 * 1024 * 1024, encoding: 'utf8' }).trim();
if (res && res.length > 100) {
  const cleanB64 = res.replace(/^data:image\/\w+;base64,/, '');
  fs.writeFileSync('scratch/event-b335-snapshot.jpg', Buffer.from(cleanB64, 'base64'));
  console.log('Saved scratch/event-b335-snapshot.jpg, size:', fs.statSync('scratch/event-b335-snapshot.jpg').size);
} else {
  console.log('No snapshotBase64 found or too short:', res.slice(0, 100));
}
