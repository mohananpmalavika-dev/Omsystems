import { execSync } from 'child_process';

const code = `
const { createDecipheriv } = require('crypto');
const pg = require('pg');
const pool = new pg.Pool({ connectionString: 'postgresql://sentinel_admin:SentinelGridDbMaster2026@postgres:5432/sentinel_grid?sslmode=disable' });
const key = Buffer.from(process.env.STREAM_VAULT_KEY, 'base64');

async function main() {
  const refs = [
    'edge://9f108498-4dd5-4a21-b810-eec9e538953c/61790ac5-89a1-4bca-aaae-00ae4d6e1d1e',
    'edge://9f108498-4dd5-4a21-b810-eec9e538953c/c8ca15c7-304c-45e5-8f9e-bcf8a9ee5fa6',
    'edge://9f108498-4dd5-4a21-b810-eec9e538953c/1f96bfff-936d-46e4-940d-2ebe59fb2901',
    'edge://9f108498-4dd5-4a21-b810-eec9e538953c/2e3ecf3b-7ac3-4f1f-a57b-87f699f0b314',
    'edge://9f108498-4dd5-4a21-b810-eec9e538953c/df757572-051e-4059-a819-51baa0db01e7',
    'edge://9f108498-4dd5-4a21-b810-eec9e538953c/4b099e4b-ae95-4f97-bc23-1fa5d683cb39',
    'edge://9f108498-4dd5-4a21-b810-eec9e538953c/985c7070-8b4d-45d9-a153-eab99b247635',
    'edge://9f108498-4dd5-4a21-b810-eec9e538953c/83d6fa93-45b3-4a9e-ada5-15f33802cfe2',
    'edge://9f108498-4dd5-4a21-b810-eec9e538953c/6d13fef1-16be-4634-a118-d2c05ae2b07c'
  ];
  for (const ref of refs) {
    const res = await pool.query('SELECT reference, encrypted_uri FROM central_stream_secrets WHERE reference = $1', [ref]);
    if (!res.rows[0]) {
      console.log(ref, '-> NOT FOUND IN DB');
      continue;
    }
    const row = res.rows[0];
    const payload = Buffer.from(row.encrypted_uri, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12));
    decipher.setAAD(Buffer.from(row.reference));
    decipher.setAuthTag(payload.subarray(12, 28));
    const decrypted = Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8');
    console.log(ref, '->', decrypted);
  }
  await pool.end();
}
main().catch(console.error);
`;

const base64 = Buffer.from(code).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
