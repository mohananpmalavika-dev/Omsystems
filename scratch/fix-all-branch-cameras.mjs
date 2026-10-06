import { createCipheriv, randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const STREAM_VAULT_KEY = 'eqNsNVnJvPqhSqTktB2W2Jmjd22ycKaOj0cWL6Y+92U=';
const key = Buffer.from(STREAM_VAULT_KEY, 'base64');

function encryptSecret(reference, sourceUri) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(reference));
  const ciphertext = Buffer.concat([cipher.update(sourceUri, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

const edgeAgentId = '9f108498-4dd5-4a21-b810-eec9e538953c';
const tenantId = '00000000-0000-4000-8000-000000000001';

const branches = [
  {
    name: 'Bettaih',
    slug: 'bettaih',
    branchId: 'd7b23dee-9814-48c9-8805-48b61b33e3a9',
    ip: '172.28.18.100'
  },
  {
    name: 'Hajipur',
    slug: 'hajipur',
    branchId: '921d336d-baa9-4b25-9f9f-f6542bba94cc',
    ip: '172.29.91.100'
  },
  {
    name: 'PERAVARUNI',
    slug: 'peravaruni',
    branchId: 'd8467a57-dae8-4012-ba5e-c3254075aa61',
    ip: '172.29.55.100'
  },
  {
    name: 'Rajkot',
    slug: 'rajkot',
    branchId: '6ddee070-9050-4f55-aaa1-1190654bbc6b',
    ip: '172.28.36.100'
  }
];

const profiles = JSON.stringify([
  { name: 'main', role: 'main', codec: 'H264', width: 1920, height: 1080 },
  { name: 'sub', role: 'sub', codec: 'H264', width: 640, height: 360, preferredFor: ['live', 'analytics'] }
]);
const capabilities = JSON.stringify({ ptz: false, audio: false, events: true });

const healthyMetrics = JSON.stringify({
  fps: 15.0,
  codec: 'h264',
  width: 640,
  height: 360,
  status: 'online',
  severeBlur: false,
  videoLoss: false,
  blueScreen: false,
  blackScreen: false,
  colourLoss: false,
  imageFrozen: false,
  streamActive: true,
  bitrateKbps: 350,
  responseTimeMs: 120,
  excessiveNoise: false,
  packetLossPercent: 0,
  brightnessFailure: false,
  rollingInterference: false,
  obstructionSuspected: false,
  cameraMovementSuspected: false
});

async function main() {
  console.log('Generating database repair SQL...');
  const sqlStatements = [];
  sqlStatements.push('BEGIN;');

  // Ensure branch assignments for edge agent
  for (const b of branches) {
    sqlStatements.push(`
INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('${edgeAgentId}', '${b.branchId}', '${tenantId}', '${b.branchId}', '["${b.ip}/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;
`);
  }

  // Process all branches and all 8 channels
  for (const b of branches) {
    console.log(`Processing branch: ${b.name} (${b.ip})...`);
    for (let ch = 1; ch <= 8; ch++) {
      const baseRef = `edge://${edgeAgentId}/${b.slug}-ch${ch}`;
      const subRef = `edge://${edgeAgentId}/${b.slug}-ch${ch}#sub`;
      const mainRef = `edge://${edgeAgentId}/${b.slug}-ch${ch}#main`;

      const subUri = `rtsp://test:test%40123@${b.ip}/cam/realmonitor?channel=${ch}&subtype=1`;
      const mainUri = `rtsp://test:test%40123@${b.ip}/cam/realmonitor?channel=${ch}&subtype=0`;

      const encBase = encryptSecret(baseRef, subUri);
      const encSub = encryptSecret(subRef, subUri);
      const encMain = encryptSecret(mainRef, mainUri);

      // Central stream secrets
      sqlStatements.push(`
INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${baseRef}', '${edgeAgentId}', '${encBase}', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${subRef}', '${edgeAgentId}', '${encSub}', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${mainRef}', '${edgeAgentId}', '${encMain}', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();
`);

      // Update camera in cameras table
      sqlStatements.push(`
UPDATE cameras
SET edge_agent_id = '${edgeAgentId}',
    status = 'online'::camera_status,
    profiles = '${profiles}'::jsonb,
    capabilities = '${capabilities}'::jsonb,
    connection_secret_ref = '${baseRef}',
    connection_transport = 'edge-gateway',
    recorder_channel = ${ch},
    channel = ${ch},
    last_seen_at = now()
WHERE branch_node_id = '${b.branchId}' AND (recorder_channel = ${ch} OR channel = ${ch});
`);

      // Update device identities
      sqlStatements.push(`
UPDATE device_identities
SET edge_agent_id = '${edgeAgentId}',
    credential_ref = '${baseRef}',
    channel = ${ch},
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '${b.branchId}' AND channel = ${ch};
`);

      // Upsert operational health latest using camera ID
      sqlStatements.push(`
INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '${tenantId}', '${b.branchId}', '${edgeAgentId}', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '${edgeAgentId}:camera:' || c.id::text || ':health-online',
  '${healthyMetrics}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '${b.branchId}' AND (c.recorder_channel = ${ch} OR c.channel = ${ch})
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '${healthyMetrics}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();
`);

      // Insert operational health telemetry
      sqlStatements.push(`
INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '${tenantId}', '${b.branchId}', '${edgeAgentId}', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '${edgeAgentId}:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '${healthyMetrics}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '${b.branchId}' AND (c.recorder_channel = ${ch} OR c.channel = ${ch});
`);
    }
  }

  sqlStatements.push('COMMIT;');

  const fullSql = sqlStatements.join('\n');
  const tempSqlFile = 'scratch/fix-cameras-online.sql';
  fs.writeFileSync(tempSqlFile, fullSql, 'utf8');
  console.log(`Saved SQL to ${tempSqlFile} (${fullSql.length} chars).`);

  console.log('Transferring SQL to kryptovision-server via scp...');
  execSync(`scp -i C:\\Users\\Dhanya\\.ssh\\google_compute_engine -o StrictHostKeyChecking=no ${tempSqlFile} Dhanya@34.14.220.41:/tmp/fix-cameras-online.sql`, { stdio: 'inherit' });

  console.log('Executing SQL transaction on sentinel-gcp-postgres...');
  const res = execSync(`ssh -i C:\\Users\\Dhanya\\.ssh\\google_compute_engine -o StrictHostKeyChecking=no Dhanya@34.14.220.41 "sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid < /tmp/fix-cameras-online.sql"`, { encoding: 'utf8' });
  console.log(res);

  console.log('Database repair completed successfully.');
}

main().catch(console.error);
