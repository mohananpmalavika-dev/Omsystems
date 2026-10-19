import { randomBytes, scryptSync } from 'node:crypto';
import { execSync } from 'node:child_process';

const salt = randomBytes(16);
const derived = scryptSync('test@123', salt, 64);
const hash = 'scrypt$' + salt.toString('base64url') + '$' + derived.toString('base64url');

const sql = `
UPDATE users SET password_hash = '${hash}', status = 'active', active = true WHERE username = 'test';
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));

// Test login
const loginRes = await fetch('https://35-200-130-81.sslip.io/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'test', password: 'test@123' })
});
console.log('Login result:', loginRes.status, await loginRes.json());
