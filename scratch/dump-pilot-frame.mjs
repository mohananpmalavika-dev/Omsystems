import { execSync } from 'child_process';

const script = `
import { createClient } from 'redis';
import fs from 'fs';

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

const camId = 'd2e27fc9-8bd2-4184-8397-7581ac3ffeda'; // Channel 8
const raw = await redis.get('analytics:latest-frame:' + camId);

if (raw) {
  const val = JSON.parse(raw);
  console.log('Got frame capturedAt:', val.capturedAt, 'len:', val.imageBase64?.length);
  if (val.imageBase64) {
    fs.writeFileSync('/tmp/pilot_test_ch8.jpg', Buffer.from(val.imageBase64, 'base64'));
    console.log('Saved to /tmp/pilot_test_ch8.jpg');
  }
} else {
  console.log('No frame found in redis for', camId);
}

await redis.quit();
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node --input-type=module"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
