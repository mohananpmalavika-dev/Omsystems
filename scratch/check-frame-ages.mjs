import { execSync } from 'child_process';

const script = `
const { createClient } = require('redis');
(async () => {
  const r = createClient({ url: process.env.REDIS_URL });
  await r.connect();
  const keys = await r.keys('analytics:latest-frame:*');
  console.log('Total keys:', keys.length);
  for (const k of keys) {
    const v = await r.get(k);
    if (v) {
      try {
        const parsed = JSON.parse(v);
        const age = (Date.now() - new Date(parsed.capturedAt).getTime()) / 1000;
        console.log(k.replace('analytics:latest-frame:', ''), 'age:', age.toFixed(1) + 's', 'len:', parsed.imageBase64?.length);
      } catch (e) {}
    }
  }
  await r.quit();
})();
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
