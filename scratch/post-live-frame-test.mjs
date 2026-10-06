import { execSync } from 'child_process';

const project = 'project-7866fc3f-5dd5-4495-804';
const zone = 'asia-south1-b';
const instance = 'kryptovision-server';

const script = `
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module <<'JS'
import { createClient } from 'redis';

const redis = createClient({ url: 'redis://:SentinelGridRedisMaster2026@redis:6379' });
await redis.connect();

try {
  const cameraId = '26b22c59-b492-434a-aa89-163fff620af1';
  const raw = await redis.get(\`analytics:latest-frame:\${cameraId}\`);
  const frameData = JSON.parse(raw);

  const payload = {
    tenantId: '00000000-0000-4000-8000-000000000001',
    cameraId,
    capturedAt: new Date().toISOString(),
    width: 640,
    height: 360,
    imageBase64: frameData.imageBase64,
    rules: [
      {
        id: 'debug-helmet-rule',
        cameraId,
        detectionType: 'helmet-worn',
        enabled: true,
        minConfidence: 0.5,
        minDurationSeconds: 0,
      },
      {
        id: 'debug-person-rule',
        cameraId,
        detectionType: 'person',
        enabled: true,
        minConfidence: 0.5,
        minDurationSeconds: 0,
      }
    ],
    metadata: { source: 'debug-test' }
  };

  const res = await fetch('http://localhost:8092/internal/frames', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-analytics-source-key': '10bcf3c15292e4a76522e6c2b73644cd0f480e57fc67ab293ec60ac5c6a82844'
    },
    body: JSON.stringify(payload)
  });

  const body = await res.json();
  console.log('HTTP Status:', res.status);
  console.log('Response body:', JSON.stringify(body, null, 2));

} catch (err) {
  console.error('Error:', err);
} finally {
  await redis.quit();
}
JS
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="echo ${b64} | base64 -d | bash"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
