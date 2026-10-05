import { createDecipheriv } from 'node:crypto';
import { execSync } from 'child_process';

const key = Buffer.from('eqNsNVnJvPqhSqTktB2W2Jmjd22ycKaOj0cWL6Y+92U=', 'base64');

function decrypt(reference, encryptedBase64) {
  try {
    const payload = Buffer.from(encryptedBase64, 'base64');
    const iv = payload.subarray(0, 12);
    const authTag = payload.subarray(12, 28);
    const ciphertext = payload.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(reference));
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (err) {
    return 'DECRYPT_ERR: ' + err.message;
  }
}

const sql = `
SELECT reference, encrypted_uri FROM central_stream_secrets 
WHERE reference LIKE '%hajipur-ch%';
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -t -A -F'|'"`;
const out = execSync(cmd, { encoding: 'utf8' });

out.split('\n').filter(Boolean).forEach(line => {
  const [ref, enc] = line.split('|');
  if (ref && enc) {
    console.log(ref, '==>', decrypt(ref, enc));
  }
});
