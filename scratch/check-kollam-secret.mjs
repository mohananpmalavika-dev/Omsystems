import { execSync } from 'node:child_process';
import { createDecipheriv } from 'node:crypto';

const STREAM_VAULT_KEY = 'eqNsNVnJvPqhSqTktB2W2Jmjd22ycKaOj0cWL6Y+92U=';
const key = Buffer.from(STREAM_VAULT_KEY, 'base64');

function decryptSecret(reference, encryptedBase64) {
  try {
    const raw = Buffer.from(encryptedBase64, 'base64');
    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(reference));
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (e) {
    return `Error: ${e.message}`;
  }
}

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -t -A"`,
    { encoding: 'utf8' }
  );
}

const out = runSql(`
SELECT reference, edge_agent_id, encrypted_uri 
FROM central_stream_secrets 
WHERE reference LIKE '%kollam-ch1%'
ORDER BY reference;
`);

for (const line of out.trim().split('\n')) {
  if (!line) continue;
  const [ref, ag, enc] = line.split('|');
  console.log(`${ref} (agent: ${ag}) -> ${decryptSecret(ref, enc)}`);
}

const camInfo = runSql(`
SELECT id, channel, recorder_channel, connection_secret_ref, edge_agent_id, profiles, capabilities
FROM cameras
WHERE id = 'b7a24b40-013d-40c9-bd46-823cbcf6e326';
`);
console.log("Kollam Cam info:\n", camInfo);
