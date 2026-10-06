import { execSync } from 'child_process';

const project = 'project-7866fc3f-5dd5-4495-804';
const zone = 'asia-south1-b';
const instance = 'kryptovision-server';

const script = `
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module << 'JS'
import { createClient } from 'redis';

const redis = createClient({ url: 'redis://:SentinelGridRedisMaster2026@redis:6379' });
await redis.connect();
const keys = await redis.keys('analytics:latest-frame:*');

for (const key of keys) {
  const cameraId = key.replace('analytics:latest-frame:', '');
  const raw = await redis.get(key);
  if (!raw) continue;
  const frameData = JSON.parse(raw);
  const imageBuffer = Buffer.from(frameData.imageBase64, 'base64');
  let sum = 0;
  let min = 255;
  let max = 0;
  for (let i = 0; i < imageBuffer.length; i++) {
    const v = imageBuffer[i];
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mean = sum / imageBuffer.length;
  console.log(\`Camera \${cameraId}: length=\${imageBuffer.length}, min=\${min}, max=\${max}, mean=\${mean.toFixed(1)}, capturedAt=\${frameData.capturedAt}\`);
}

await redis.quit();
JS
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="echo ${b64} | base64 -d | bash"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
