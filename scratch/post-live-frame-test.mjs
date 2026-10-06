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

  const rules = [
    {
      id: 'debug-helmet-rule',
      cameraId,
      detectionType: 'helmet-worn',
      enabled: true,
      minConfidence: 0.5,
      minDurationSeconds: 0,
    }
  ];

  const now = Date.now();

  console.log('--- Frame 1 (t=0) ---');
  const res1 = await fetch('http://localhost:8092/internal/frames', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-analytics-source-key': '10bcf3c15292e4a76522e6c2b73644cd0f480e57fc67ab293ec60ac5c6a82844'
    },
    body: JSON.stringify({
      tenantId: '00000000-0000-4000-8000-000000000001',
      cameraId,
      capturedAt: new Date(now).toISOString(),
      width: 640,
      height: 360,
      imageBase64: frameData.imageBase64,
      rules,
      metadata: { source: 'debug-test' }
    })
  });
  console.log('Frame 1:', await res1.json());

  console.log('--- Frame 2 (t=+2000ms) ---');
  const res2 = await fetch('http://localhost:8092/internal/frames', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-analytics-source-key': '10bcf3c15292e4a76522e6c2b73644cd0f480e57fc67ab293ec60ac5c6a82844'
    },
    body: JSON.stringify({
      tenantId: '00000000-0000-4000-8000-000000000001',
      cameraId,
      capturedAt: new Date(now + 2000).toISOString(),
      width: 640,
      height: 360,
      imageBase64: frameData.imageBase64,
      rules,
      metadata: { source: 'debug-test' }
    })
  });
  console.log('Frame 2:', await res2.json());

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
