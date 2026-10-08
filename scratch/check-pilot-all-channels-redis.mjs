import { execSync } from 'child_process';

const cameraIds = [
  { ch: 1, id: 'c19f9147-bb01-4e9f-8f42-dd4b361a398e' },
  { ch: 2, id: '62245da0-302a-46b1-a068-98c8dc70892a' },
  { ch: 3, id: 'b9a60efd-cc76-4d4f-9c99-afcff5563602' },
  { ch: 4, id: '2d5563a9-2c14-4ccd-b160-8897edf2eb13' },
  { ch: 5, id: 'cf21c87a-0f42-4203-bc9c-740ef72987a1' },
  { ch: 6, id: '45a1d045-e627-4037-a239-672d3b35d87b' },
  { ch: 7, id: '8a50c8f9-b16e-4061-9665-cf6d56df3414' },
  { ch: 8, id: 'ed44346e-9473-4795-8ef3-ba4d6bfb91d9' },
  { ch: 9, id: '2d8053f1-af9f-40df-94d3-3e432e13bd85' },
  { ch: 11, id: '344c3c01-00b6-4856-83d1-fdf60c28c757' },
];

const script = `
import { createRequire } from 'node:module';
const { createClient } = createRequire('/app/package.json')('redis');
import { loadConfig } from '/app/dist/src/config.js';

const r = createClient({ url: loadConfig().REDIS_URL });
await r.connect();

for (const cam of ${JSON.stringify(cameraIds)}) {
  const ttl = await r.ttl('analytics:latest-frame:' + cam.id);
  const raw = await r.get('analytics:latest-frame:' + cam.id);
  if (raw) {
    const f = JSON.parse(raw);
    console.log(JSON.stringify({ ch: cam.ch, id: cam.id, ttl, capturedAt: f.capturedAt, size: f.imageBase64?.length }));
  } else {
    console.log(JSON.stringify({ ch: cam.ch, id: cam.id, ttl }));
  }
}

await r.quit();
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node -"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
