import { execSync } from 'child_process';
import fs from 'fs';

const code = `
const { createDecipheriv } = require('crypto');
const pg = require('pg');
const pool = new pg.Pool({ connectionString: 'postgresql://sentinel_admin:SentinelGridDbMaster2026@postgres:5432/sentinel_grid?sslmode=disable' });
const key = Buffer.from(process.env.STREAM_VAULT_KEY, 'base64');

async function main() {
  const res = await pool.query("SELECT reference, encrypted_uri FROM central_stream_secrets WHERE reference LIKE '%hajipur-ch%' ORDER BY reference");
  for (const row of res.rows) {
    try {
      const payload = Buffer.from(row.encrypted_uri, 'base64');
      const decipher = createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12));
      decipher.setAAD(Buffer.from(row.reference));
      decipher.setAuthTag(payload.subarray(12, 28));
      const decrypted = Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8');
      console.log(row.reference, '->', decrypted);
    } catch (e) {
      console.error('Error decrypting', row.reference, e.message);
    }
  }
  await pool.end();
}
main().catch(console.error);
`;

const base64 = Buffer.from(code).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
