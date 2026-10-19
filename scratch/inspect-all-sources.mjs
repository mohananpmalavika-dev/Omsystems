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
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`,
    { encoding: 'utf8' }
  );
}

console.log("=== ONLINE EDGE AGENTS ===");
console.log(runSql("SELECT id, name, version, status, last_seen_at FROM edge_agents WHERE last_seen_at > now() - interval '1 hour' ORDER BY name;"));

console.log("=== ALL PERAVARUNI AND RAJKOT SECRETS ===");
const out = runSql(`
SELECT reference, edge_agent_id, encrypted_uri 
FROM central_stream_secrets 
WHERE reference LIKE '%rajkot%' OR reference LIKE '%peravaruni%'
ORDER BY reference;
`);

for (const line of out.trim().split('\n')) {
  if (!line || !line.includes('|')) continue;
  const parts = line.split('|').map(s => s.trim());
  if (parts.length >= 3) {
    console.log(`${parts[0]} [${parts[1].slice(0, 8)}] -> ${decryptSecret(parts[0], parts[2])}`);
  }
}

console.log("\n=== ALL DISTINCT DECRYPTED RTSP URIS IN THE SYSTEM ===");
const allSecs = runSql(`SELECT reference, encrypted_uri FROM central_stream_secrets;`);
const distinctUris = new Set();
for (const line of allSecs.trim().split('\n')) {
  if (!line || !line.includes('|')) continue;
  const parts = line.split('|').map(s => s.trim());
  if (parts.length >= 2) {
    const dec = decryptSecret(parts[0], parts[1]);
    if (!dec.startsWith('Error')) distinctUris.add(dec);
  }
}
for (const u of distinctUris) {
  console.log(" -", u);
}
