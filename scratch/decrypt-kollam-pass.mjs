import { execSync } from 'child_process';

const code = `
const { createDecipheriv } = require('crypto');
const pg = require('pg');
const pool = new pg.Pool({ connectionString: 'postgresql://sentinel_admin:SentinelGridDbMaster2026@postgres:5432/sentinel_grid?sslmode=disable' });
const key = Buffer.from(process.env.STREAM_VAULT_KEY, 'base64');

async function main() {
  const res = await pool.query("SELECT id, username, password_encrypted FROM camera_credentials WHERE ip_address = '192.168.1.33' AND password_encrypted IS NOT NULL");
  for (const row of res.rows) {
    const ref = 'camera-credential:' + row.id;
    try {
      const payload = Buffer.from(row.password_encrypted, 'base64');
      const decipher = createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12));
      decipher.setAAD(Buffer.from(ref));
      decipher.setAuthTag(payload.subarray(12, 28));
      const decrypted = Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8');
      console.log('Credentials for', row.username, ':', decrypted);
    } catch (e) {
      console.error('Error decrypting for', row.username, e.message);
    }
  }
  await pool.end();
}
main().catch(console.error);
`;

const base64 = Buffer.from(code).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
