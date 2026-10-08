import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';

const nodeScript = `
const Redis = require('ioredis');
const redis = new Redis('redis://:SentinelGridRedisMaster2026@redis:6379');

async function main() {
  const keys = await redis.keys('analytics:latest-frame:*');
  console.log('Total active streaming cameras in Redis:', keys.length);
  for (const k of keys.sort()) {
    const camId = k.split(':').pop();
    const raw = await redis.get(k);
    if (raw) {
      try {
        const d = JSON.parse(raw);
        console.log('Camera ' + camId + ': ' + d.width + 'x' + d.height + ' (' + d.imageEncoding + ') capturedAt=' + d.capturedAt);
      } catch (err) {
        console.log('Camera ' + camId + ': parse error ' + err.message);
      }
    }
  }
  await redis.quit();
}
main().catch(console.error);
`;

const innerB64 = Buffer.from(nodeScript).toString('base64');
const cmd = 'echo ' + innerB64 + ' | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node';
const command = 'echo ' + gzipSync(Buffer.from(cmd)).toString('base64') + ' | base64 -d | gzip -d | bash';

const r = spawnSync('gcloud.cmd', [
  'compute', 'ssh', 'kryptovision-server',
  '--zone=asia-south1-b',
  '--project=project-7866fc3f-5dd5-4495-804',
  '--quiet',
  '--command=' + JSON.stringify(command)
], { shell: true, encoding: 'utf8', timeout: 60000 });

console.log(r.stdout || r.stderr);
