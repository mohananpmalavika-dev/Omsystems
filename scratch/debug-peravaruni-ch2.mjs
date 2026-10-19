import { execSync } from 'node:child_process';

const base = "https://35-200-130-81.sslip.io";

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x"`,
    { encoding: 'utf8' }
  );
}

const loginRes = await fetch(`${base}/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test@123" })
});
const loginData = await loginRes.json();
const token = loginData.accessToken || loginData.token;

console.log("=== PERAVARUNI CAMERAS IN DB ===");
console.log(runSql(`
  SELECT c.id, c.channel, b.name as branch, c.edge_agent_id, c.connection_secret_ref, c.status
  FROM cameras c
  JOIN branches b ON b.id = c.branch_node_id
  WHERE b.name = 'PERAVARUNI'
  ORDER BY c.channel;
`));

console.log("=== PERAVARUNI SECRETS IN DB ===");
console.log(runSql(`
  SELECT reference, edge_agent_id, length(ciphertext) as clen, updated_at
  FROM central_stream_secrets
  WHERE reference LIKE '%peravaruni%' OR reference LIKE '%6dd10cd4%'
  ORDER BY reference;
`));

// Test Ch 2 specifically
const camRows = runSql(`
  SELECT c.id, c.channel, b.name as branch, c.edge_agent_id
  FROM cameras c
  JOIN branches b ON b.id = c.branch_node_id
  WHERE b.name = 'PERAVARUNI' AND c.channel = 2;
`).trim();

const camId = camRows.split('\n').find(l => l.includes('id |'))?.split('|')[1]?.trim();
console.log(`Testing Peravaruni Ch 2 (Cam ID: ${camId})...`);

const sRes = await fetch(`${base}/v1/cameras/${camId}/live-sessions`, {
  method: "POST",
  headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
  body: JSON.stringify({ profile: "sub" })
});
const sData = await sRes.json();
console.log("Session response:", sData);

const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ controlPlaneToken: sData.token })
});
console.log("Start status:", startRes.status);
const startBody = await startRes.text();
console.log("Start body:", startBody);
