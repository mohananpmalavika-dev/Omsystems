import { execSync } from 'child_process';
import fs from 'fs';

// Get latest frame from Redis for Pilot Channel 6 (58b83ac6-6273-4dab-9c75-2848d7775ca2)
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="sudo docker exec sentinel-gcp-redis redis-cli -a SentinelGridRedisMaster2026 get 'analytics:latest-frame:58b83ac6-6273-4dab-9c75-2848d7775ca2'"`;

const raw = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
try {
  // Strip Redis warning
  const jsonStart = raw.indexOf('{');
  if (jsonStart !== -1) {
    const data = JSON.parse(raw.slice(jsonStart));
    console.log('Captured At:', data.capturedAt);
    console.log('Image Base64 length:', data.imageBase64?.length);
    fs.writeFileSync('scratch/live-ch6.jpg', Buffer.from(data.imageBase64, 'base64'));
    console.log('Saved to scratch/live-ch6.jpg');
  } else {
    console.log('No JSON found:', raw.slice(0, 200));
  }
} catch (e) {
  console.error('Error:', e.message);
}
