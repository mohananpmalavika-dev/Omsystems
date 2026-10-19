import { execSync } from 'node:child_process';

const base = "https://35-200-130-81.sslip.io";

const loginRes = await fetch(`${base}/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test@123" })
});
const loginData = await loginRes.json();
const token = loginData.accessToken || loginData.token;

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -t -A"`,
    { encoding: 'utf8' }
  );
}

const camRows = runSql(`
  SELECT c.id, c.channel, b.name as branch, c.edge_agent_id
  FROM cameras c
  JOIN branches b ON b.id = c.branch_node_id
  WHERE c.channel = 1
  ORDER BY b.name;
`).trim().split('\n').filter(Boolean);

for (const row of camRows) {
  const [camId, ch, branch, ag] = row.split('|');
  console.log(`\n================ Testing ${branch} Ch ${ch} ================`);
  const sRes = await fetch(`${base}/v1/cameras/${camId}/live-sessions`, {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
    body: JSON.stringify({ profile: "sub" })
  });
  const sData = await sRes.json();
  console.log('Session response:', sData);

  const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ controlPlaneToken: sData.token })
  });
  const startData = await startRes.json();
  console.log('Start response:', startData);

  const hlsUrl = startData.hls.url;
  const hlsToken = startData.hls.bearerToken;

  const m3u8Res = await fetch(`${hlsUrl}?token=${hlsToken}`);
  const m3u8Text = await m3u8Res.text();
  console.log('Master playlist:\n', m3u8Text);

  const streamMatch = m3u8Text.match(/(video\d+_stream\.m3u8\S*)/);
  if (streamMatch) {
    const baseUrl = hlsUrl.substring(0, hlsUrl.lastIndexOf('/') + 1);
    const subUrl = baseUrl + streamMatch[1];
    const subRes = await fetch(subUrl);
    const subText = await subRes.text();
    console.log('Media playlist:\n', subText);
  }
}
