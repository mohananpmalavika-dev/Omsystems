import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const sql = readFileSync(process.argv[2], 'utf8');
const encoded = Buffer.from(sql).toString('base64');
const runner = process.argv[2].endsWith('.mjs')
  ? 'sudo docker exec -i sentinel-gcp-control-plane node --input-type=module'
  : process.argv[2].endsWith('.sh') ? 'bash'
  : 'sudo docker exec -i sentinel-gcp-postgres psql -X -v ON_ERROR_STOP=1 -U sentinel_admin -d sentinel_grid';
const command = `gcloud.cmd compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${encoded}' | base64 -d | ${runner}"`;
try {
  process.stdout.write(execSync(command, { encoding: 'utf8', timeout: 90000, maxBuffer: 4 * 1024 * 1024 }));
} catch (error) {
  process.stdout.write(error.stdout || '');
  process.stderr.write(error.stderr || error.message);
  process.exit(1);
}
