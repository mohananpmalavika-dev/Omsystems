import { execSync } from 'node:child_process';

const base = "https://35-200-130-81.sslip.io";

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -t -A"`,
    { encoding: 'utf8' }
  );
}

async function verifySouthZoneStatus() {
  console.log("================================================================================");
  console.log("📹 SOUTH ZONE CAMERA VERIFICATION & LIVE STREAM AUDIT");
  console.log("================================================================================\n");

  // 1. Database state
  const dbData = runSql(`
    SELECT 
      c.id,
      c.channel,
      rn.name as camera_name,
      b.name as branch_name,
      z.name as zone_name,
      c.status as camera_status,
      c.ip_address,
      c.edge_agent_id,
      c.connection_secret_ref,
      rn.is_active as node_active,
      COALESCE(ohl.metrics->>'status', 'none') as health_status,
      COALESCE(ohl.metrics->>'streamActive', 'false') as stream_active
    FROM cameras c
    JOIN resource_nodes b ON c.branch_node_id = b.id
    JOIN resource_nodes z ON b.parent_id = z.id
    LEFT JOIN resource_nodes rn ON c.resource_node_id = rn.id
    LEFT JOIN operational_health_latest ohl ON (ohl.device_id = c.id::text AND ohl.device_type = 'camera')
    WHERE z.name ILIKE '%south%'
    ORDER BY c.channel;
  `).trim().split('\n').filter(Boolean);

  console.log(`Found ${dbData.length} cameras configured in South Zone:\n`);
  
  const cameras = [];
  for (const line of dbData) {
    const [id, ch, name, branch, zone, status, ip, agentId, secretRef, nodeActive, healthStatus, streamActive] = line.split('|');
    cameras.push({ id, ch, name, branch, zone, status, ip, agentId, secretRef, nodeActive, healthStatus, streamActive });
    console.log(`  Channel ${ch}: ${name || 'Camera ' + ch}`);
    console.log(`    Camera ID:     ${id}`);
    console.log(`    Status:        ${status} (Health: ${healthStatus}, StreamActive: ${streamActive}, NodeActive: ${nodeActive})`);
    console.log(`    IP & Agent:    ${ip} via Agent ${agentId.slice(0, 8)}...`);
    console.log(`    Secret Ref:    ${secretRef}`);
    console.log('');
  }

  // 2. Test live sessions and streams via Control Plane API
  console.log("Testing live streaming via Control Plane and Media Gateway API...");
  const loginRes = await fetch(`${base}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "test", password: "test@123" })
  });
  const loginData = await loginRes.json();
  const token = loginData.accessToken;

  let allOnline = true;
  for (const cam of cameras) {
    try {
      const sRes = await fetch(`${base}/v1/cameras/${cam.id}/live-sessions`, {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
        body: JSON.stringify({ profile: "sub" })
      });
      const sData = await sRes.json();
      if (!sRes.ok || !sData.token || !sData.mediaGatewayUrl) {
        console.log(`❌ Channel ${cam.ch} Live Session Failed:`, sData);
        allOnline = false;
        continue;
      }

      const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ controlPlaneToken: sData.token })
      });
      const startData = await startRes.json();
      if (startRes.status !== 201 || !startData.hls) {
        console.log(`❌ Channel ${cam.ch} Stream Start Failed:`, startData);
        allOnline = false;
        continue;
      }

      console.log(`✅ Channel ${cam.ch} (${cam.branch}): Stream started, HLS playlist URL available.`);
    } catch (err) {
      console.log(`❌ Channel ${cam.ch} Exception:`, err.message);
      allOnline = false;
    }
  }

  console.log("\n================================================================================");
  if (allOnline) {
    console.log("🎉 ALL CAMERAS IN SOUTH ZONE ARE ONLINE AND STREAMING LIVE!");
  } else {
    console.log("⚠️ Some cameras encountered errors.");
  }
  console.log("================================================================================\n");
}

verifySouthZoneStatus().catch(console.error);
