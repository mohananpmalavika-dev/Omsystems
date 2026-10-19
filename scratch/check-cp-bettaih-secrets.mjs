import { execSync } from 'node:child_process';

const code = `
const pg = require('pg');
const { createDecipheriv } = require('crypto');
const pool = new pg.Pool({ connectionString: 'postgresql://sentinel_admin:SentinelGridDbMaster2026@postgres:5432/sentinel_grid?sslmode=disable' });
const key = Buffer.from(process.env.STREAM_VAULT_KEY, 'base64');

async function main() {
  const res = await pool.query("SELECT reference, edge_agent_id, encrypted_uri FROM central_stream_secrets WHERE reference LIKE '%bettaih-ch%'");
  for (const r of res.rows) {
    try {
      const raw = Buffer.from(r.encrypted_uri, 'base64');
      const iv = raw.subarray(0, 12);
      const tag = raw.subarray(12, 28);
      const ct = raw.subarray(28);
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(Buffer.from(r.reference));
      decipher.setAuthTag(tag);
      const dec = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
      console.log(r.reference, '->', dec);
    } catch (e) {
      console.log(r.reference, 'ERROR', e.message);
    }
  }
  await pool.end();
}
main().catch(console.error);
`;

const b64 = Buffer.from(code).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
