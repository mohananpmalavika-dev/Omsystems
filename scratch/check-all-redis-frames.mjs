import { execSync } from 'child_process';

const script = `
import { createClient } from 'redis';
const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();
const keys = await redis.keys('analytics:latest-frame:*');
console.log('Total latest frames in redis:', keys.length);
for (const k of keys) {
  const val = JSON.parse(await redis.get(k));
  const age = (Date.now() - new Date(val.capturedAt).getTime()) / 1000;
  console.log(k.replace('analytics:latest-frame:', ''), 'channel:', val.channel, 'age:', age.toFixed(1) + 's');
}
await redis.quit();
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node --input-type=module"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
