import { createDecipheriv } from 'node:crypto';
import { execSync } from 'node:child_process';

const sql = `
SELECT reference, edge_agent_id, encrypted_uri 
FROM central_stream_secrets 
WHERE reference LIKE 'edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch%'
ORDER BY reference;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -t -A -F '|||'"`;

const output = execSync(cmd, { encoding: 'utf8' });
const lines = output.trim().split('\n');

const key = Buffer.from('eqNsNVnJvPqhSqTktB2W2Jmjd22ycKaOj0cWL6Y+92U=', 'base64');

console.log(`Found ${lines.length} secrets:`);
for (const line of lines) {
  if (!line || !line.includes('|||')) continue;
  const [reference, edgeAgentId, encryptedUri] = line.split('|||');
  try {
    const payload = Buffer.from(encryptedUri, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12));
    decipher.setAAD(Buffer.from(reference));
    decipher.setAuthTag(payload.subarray(12, 28));
    const decrypted = Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8');
    console.log(`[${edgeAgentId.slice(0, 8)}] ${reference} -> ${decrypted}`);
  } catch (e) {
    console.log(`[${edgeAgentId ? edgeAgentId.slice(0, 8) : 'unknown'}] ${reference} -> ERROR: ${e.message}`);
  }
}
