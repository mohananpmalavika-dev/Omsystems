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

const base = "https://35-200-130-81.sslip.io";
const loginRes = await fetch(`${base}/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test@123" })
});
const loginData = await loginRes.json();
const token = loginData.accessToken || loginData.token;

const agentHajipur = '748eeb31-76f8-43e9-9121-4c1d99166e87';
const camId = '26c0477d-c9b3-4374-8ea8-641337d7e8c1'; // Peravaruni Ch 1

// We will test 172.28.36.100 (Rajkot stream source) and 172.28.18.100 (Bettaih stream source)
const candidateSources = [
  'rtsp://test:test%40123@172.28.36.100/cam/realmonitor?channel=1&subtype=1',
  'rtsp://test:test%40123@172.28.18.100/cam/realmonitor?channel=1&subtype=1'
];

for (const uri of candidateSources) {
  console.log(`\n=== Testing URI: ${uri} ===`);
  const secretRef = `edge://${agentHajipur}/peravaruni-ch1`;
  const subRef = `edge://${agentHajipur}/peravaruni-ch1#sub`;
  const mainRef = `edge://${agentHajipur}/peravaruni-ch1#main`;

  const encBase = encryptSecret(secretRef, uri);
  const encSub = encryptSecret(subRef, uri);
  const encMain = encryptSecret(mainRef, uri);

  const sql = `
BEGIN;
INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${secretRef}', '${agentHajipur}', '${encBase}', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${subRef}', '${agentHajipur}', '${encSub}', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${mainRef}', '${agentHajipur}', '${encMain}', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

UPDATE cameras
SET edge_agent_id = '${agentHajipur}',
    connection_secret_ref = '${secretRef}'
WHERE id = '${camId}';
COMMIT;
`;

  const b64 = Buffer.from(sql).toString('base64');
  execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`,
    { stdio: 'inherit' }
  );

  const sRes = await fetch(`${base}/v1/cameras/${camId}/live-sessions`, {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
    body: JSON.stringify({ profile: "sub" })
  });
  const sData = await sRes.json();
  if (!sData.token || !sData.mediaGatewayUrl) {
    console.log("Failed live session:", sData);
    continue;
  }

  const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ controlPlaneToken: sData.token })
  });
  const startData = await startRes.json();
  console.log("startRes status:", startRes.status, startData.path);

  // Poll for HLS playlist with retry up to 10 attempts (1 sec apart)
  let success = false;
  for (let attempt = 1; attempt <= 10; attempt++) {
    await new Promise(r => setTimeout(r, 1000));
    const hlsRes = await fetch(`${startData.hls.url}?token=${startData.hls.bearerToken}`);
    console.log(`  [Attempt ${attempt}] HLS status: ${hlsRes.status}`);
    if (hlsRes.status === 200) {
      const body = await hlsRes.text();
      console.log("  ✅ SUCCESS! HLS Playlist:\n", body);
      success = true;
      break;
    }
  }

  if (success) {
    console.log(`>>> SOURCE ${uri} IS WORKING PERFECTLY! <<<`);
    break;
  }
}
