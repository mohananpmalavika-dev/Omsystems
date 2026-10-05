import { execSync } from 'child_process';
import fs from 'fs';

const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="sudo docker exec sentinel-gcp-redis redis-cli -a SentinelGridRedisMaster2026 get 'analytics:latest-frame:1ba2013e-1aed-4e88-b897-23175ffbe14a'"`;

const raw = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
try {
  const jsonStart = raw.indexOf('{');
  if (jsonStart !== -1) {
    const data = JSON.parse(raw.slice(jsonStart));
    console.log('Captured At:', data.capturedAt);
    console.log('Image Base64 length:', data.imageBase64?.length);
    fs.writeFileSync('scratch/pilot-ch6-raw.bin', Buffer.from(data.imageBase64, 'base64'));
    console.log('Saved to scratch/pilot-ch6-raw.bin');
  }
} catch (e) {
  console.error('Error:', e.message);
}
