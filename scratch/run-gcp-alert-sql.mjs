import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';

const sqlPath = resolve(process.argv[2] || 'scratch/inspect-helmet-only-alerts.sql');
let sql = readFileSync(sqlPath, 'utf8');
if (process.argv.includes('--preview')) {
  if (!sql.trimEnd().endsWith('COMMIT;')) throw new Error('Expected a final COMMIT for preview');
  sql = sql.replace(/COMMIT;\s*$/, 'ROLLBACK;\n');
}
const encoded = gzipSync(Buffer.from(sql)).toString('base64');
const target = sqlPath.endsWith('.mjs')
  ? 'sudo docker exec -i sentinel-gcp-control-plane node --input-type=module'
  : 'sudo docker exec -i sentinel-gcp-postgres psql -X -v ON_ERROR_STOP=1 -U sentinel_admin -d sentinel_grid';
const command = `echo ${encoded} | base64 -d | gzip -d | ${target}`;
const result = spawnSync('gcloud.cmd', [
  'compute', 'ssh', 'kryptovision-server', '--zone=asia-south1-b',
  '--project=project-7866fc3f-5dd5-4495-804', '--quiet', `--command="${command}"`,
], { shell: true, encoding: 'utf8', timeout: 90000, maxBuffer: 1024 * 1024 });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
