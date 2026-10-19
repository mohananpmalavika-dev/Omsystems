import { createDecipheriv } from 'node:crypto';
import { execSync } from 'node:child_process';

const STREAM_VAULT_KEY = 'eqNsNVnJvPqhSqTktB2W2Jmjd22ycKaOj0cWL6Y+92U=';
const key = Buffer.from(STREAM_VAULT_KEY, 'base64');

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -t -A"`,
    { encoding: 'utf8' }
  );
}

const raw = runSql("SELECT reference || '|||' || encrypted_uri FROM central_stream_secrets WHERE reference ILIKE '%hajipur%';");
const lines = raw.trim().split('\n').filter(Boolean);

for (const line of lines) {
  const [ref, enc] = line.split('|||');
  try {
    const payload = Buffer.from(enc, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12));
    decipher.setAAD(Buffer.from(ref));
    decipher.setAuthTag(payload.subarray(12, 28));
    const decrypted = Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8');
    console.log(ref, '=>', decrypted);
  } catch (err) {
    console.log(ref, 'decrypt error:', err.message);
  }
}
