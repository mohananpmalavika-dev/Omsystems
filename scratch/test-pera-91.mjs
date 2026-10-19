import { createCipheriv, randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';

const STREAM_VAULT_KEY = 'eqNsNVnJvPqhSqTktB2W2Jmjd22ycKaOj0cWL6Y+92U=';
const key = Buffer.from(STREAM_VAULT_KEY, 'base64');

function encryptSecret(reference, sourceUri) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(reference));
  const ciphertext = Buffer.concat([cipher.update(sourceUri, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

function runRemoteSql(sql) {
  const b64 = Buffer.from(sql).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x"`,
    { encoding: 'utf8' }
  );
}

async function testStreams() {
  const agent748 = '748eeb31-76f8-43e9-9121-4c1d99166e87';
  const agent6dd = '6dd10cd4-5625-48f4-8431-23776bbd0795';

  // Let's check if 172.29.91.100 responds
  const testRef748 = `edge://${agent748}/test-probe-91-ch2`;
  const testRef748Sub = `edge://${agent748}/test-probe-91-ch2#sub`;
  const testUri91 = 'rtsp://test:test%40123@172.29.91.100/cam/realmonitor?channel=2&subtype=1';

  const enc748 = encryptSecret(testRef748, testUri91);
  const enc748Sub = encryptSecret(testRef748Sub, testUri91);

  const testRef6dd = `edge://${agent6dd}/test-probe-91-ch2`;
  const testRef6ddSub = `edge://${agent6dd}/test-probe-91-ch2#sub`;
  const enc6dd = encryptSecret(testRef6dd, testUri91);
  const enc6ddSub = encryptSecret(testRef6ddSub, testUri91);

  const sql = `
  INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
  VALUES 
    ('${testRef748}', '${agent748}', '${enc748}', now()),
    ('${testRef748Sub}', '${agent748}', '${enc748Sub}', now()),
    ('${testRef6dd}', '${agent6dd}', '${enc6dd}', now()),
    ('${testRef6ddSub}', '${agent6dd}', '${enc6ddSub}', now())
  ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();
  `;
  runRemoteSql(sql);
  console.log('Test secrets inserted into DB.');

  // Now test live session via API
  const loginRes = await fetch('https://35-200-130-81.sslip.io/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test', password: 'test@123' })
  });
  const { accessToken } = await loginRes.json();

  // Test both with start session on camera
  console.log('Testing session creation...');
}

testStreams().catch(console.error);
