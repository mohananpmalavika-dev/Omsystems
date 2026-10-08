import { execSync } from 'child_process';

const testScript = `
import { createClient } from 'redis';
import { loadConfig } from '/app/dist/src/config.js';

const config = loadConfig();
const redis = createClient({ url: config.REDIS_URL });
await redis.connect();

try {
  const camId = 'e66e3498-1c13-4f59-91d7-5a3386d269d2'; // Channel 9
  const key = 'analytics:latest-frame:' + camId;
  const raw = await redis.get(key);
  const ttl = await redis.ttl(key);
  console.log('Channel 9 frame key:', key);
  console.log('TTL:', ttl);
  if (raw) {
    const f = JSON.parse(raw);
    console.log('CapturedAt:', f.capturedAt);
    console.log('Age (s):', (Date.now() - new Date(f.capturedAt).getTime()) / 1000);
    console.log('Image dimensions:', f.width, 'x', f.height);
  } else {
    console.log('Frame not yet present in redis');
  }

  // Check all pilot camera keys
  const pilotCamIds = [
    '0f545b49-8d4c-4999-83ab-567fc9e3309c', // ch 2
    'e51113dd-d8c7-4d8b-8df9-267edeae7c94', // ch 6
    '43c562cd-2006-443d-bbc1-8a53da835efb', // ch 7
    'd2e27fc9-8bd2-4184-8397-7581ac3ffeda', // ch 8
    'e66e3498-1c13-4f59-91d7-5a3386d269d2', // ch 9
    'b9600908-db55-4fb8-8b4f-deb0b2c9d254'  // ch 11
  ];
  console.log('\\n--- ALL PILOT CAMERA FRAMES IN REDIS ---');
  for (const id of pilotCamIds) {
    const k = 'analytics:latest-frame:' + id;
    const r = await redis.get(k);
    const t = await redis.ttl(k);
    console.log(\`Camera \${id}: TTL=\${t}, present=\${Boolean(r)}\`);
  }

} finally {
  await redis.quit();
}
`;

const b64 = Buffer.from(testScript).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node --input-type=module"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
