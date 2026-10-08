import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';

const code = readFileSync('scratch/presentation-fleet-diagnostic-20261008.mjs', 'utf8');
const innerB64 = Buffer.from(code).toString('base64');
const cmd = 'echo ' + innerB64 + ' | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node --input-type=module';
const command = 'echo ' + gzipSync(Buffer.from(cmd)).toString('base64') + ' | base64 -d | gzip -d | bash';

const r = spawnSync('gcloud.cmd', [
  'compute', 'ssh', 'kryptovision-server',
  '--zone=asia-south1-b',
  '--project=project-7866fc3f-5dd5-4495-804',
  '--quiet',
  '--command=' + JSON.stringify(command)
], { shell: true, encoding: 'utf8', timeout: 60000 });

console.log(r.stdout || r.stderr);
