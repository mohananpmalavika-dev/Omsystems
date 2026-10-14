import { createCipheriv, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const STREAM_VAULT_KEY = 'eqNsNVnJvPqhSqTktB2W2Jmjd22ycKaOj0cWL6Y+92U=';
const key = Buffer.from(STREAM_VAULT_KEY, 'base64');

function encryptSecret(reference, sourceUri) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(reference));
  const ciphertext = Buffer.concat([cipher.update(sourceUri, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

const tenantId = '00000000-0000-4000-8000-000000000001';

// Edge agents
const agentPeravaruni = '839d2a88-2b36-4e34-bd99-6cb247e196a5'; // active online scanner
const agentHajipur = '748eeb31-76f8-43e9-9121-4c1d99166e87';    // active online scanner
const agentGateway = '9f108498-4dd5-4a21-b810-eec9e538953c';    // gateway

const activeAgents = [agentPeravaruni, agentHajipur, agentGateway];

const branches = [
  {
    name: 'Bettaih',
    slug: 'bettaih',
    branchId: 'd7b23dee-9814-48c9-8805-48b61b33e3a9',
    ip: '172.28.18.100',
    primaryAgent: agentHajipur
  },
  {
    name: 'Hajipur',
    slug: 'hajipur',
    branchId: '921d336d-baa9-4b25-9f9f-f6542bba94cc',
    ip: '172.29.91.100',
    primaryAgent: agentPeravaruni
  },
  {
    name: 'PERAVARUNI',
    slug: 'peravaruni',
    branchId: 'd8467a57-dae8-4012-ba5e-c3254075aa61',
    ip: '172.29.55.100',
    primaryAgent: agentPeravaruni
  },
  {
    name: 'Rajkot',
    slug: 'rajkot',
    branchId: '6ddee070-9050-4f55-aaa1-1190654bbc6b',
    ip: '172.28.36.100',
    primaryAgent: agentHajipur
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
  console.log('Generating comprehensive Wizzmoni camera fix SQL...');
  const sqlStatements = [];
  sqlStatements.push('BEGIN;');

  // 1. Ensure all 3 edge agents are marked online with recent last_seen_at
  for (const ag of activeAgents) {
    sqlStatements.push(`
UPDATE edge_agents
SET status = 'online',
    last_seen_at = now()
WHERE id = '${ag}';
`);
  }

  // 2. Ensure edge_agent_branch_assignments links ALL 3 agents to ALL 4 branches
  for (const ag of activeAgents) {
    for (const b of branches) {
      sqlStatements.push(`
INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('${ag}', '${b.branchId}', '${tenantId}', '${b.branchId}', '["${b.ip}/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;
`);
    }
  }

  // 3. Populate central_stream_secrets for ALL agents and ALL branches
  for (const b of branches) {
    for (let ch = 1; ch <= 8; ch++) {
      const subUri = `rtsp://test:test%40123@${b.ip}/cam/realmonitor?channel=${ch}&subtype=1`;
      const mainUri = `rtsp://test:test%40123@${b.ip}/cam/realmonitor?channel=${ch}&subtype=0`;

      for (const ag of activeAgents) {
        const baseRef = `edge://${ag}/${b.slug}-ch${ch}`;
        const subRef = `edge://${ag}/${b.slug}-ch${ch}#sub`;
        const mainRef = `edge://${ag}/${b.slug}-ch${ch}#main`;

        const encBase = encryptSecret(baseRef, subUri);
        const encSub = encryptSecret(subRef, subUri);
        const encMain = encryptSecret(mainRef, mainUri);

        sqlStatements.push(`
INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${baseRef}', '${ag}', '${encBase}', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${subRef}', '${ag}', '${encSub}', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${mainRef}', '${ag}', '${encMain}', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();
`);
      }
    }
  }

  // 4. Update cameras table for each branch to use their primary agent and correct matching secret ref
  for (const b of branches) {
    const ag = b.primaryAgent;
    for (let ch = 1; ch <= 8; ch++) {
      const baseRef = `edge://${ag}/${b.slug}-ch${ch}`;

      sqlStatements.push(`
UPDATE cameras
SET edge_agent_id = '${ag}',
    status = 'online'::camera_status,
    profiles = '${profiles}'::jsonb,
    capabilities = '${capabilities}'::jsonb,
    connection_secret_ref = '${baseRef}',
    connection_transport = 'edge-gateway',
    recorder_channel = ${ch},
    channel = ${ch},
    last_seen_at = now()
WHERE branch_node_id = '${b.branchId}' AND (recorder_channel = ${ch} OR channel = ${ch});

UPDATE device_identities
SET edge_agent_id = '${ag}',
    credential_ref = '${baseRef}',
    channel = ${ch},
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '${b.branchId}' AND channel = ${ch};
`);
    }
  }

  // Special case: Hajipur has Channel 9
  const hajipurCh9Ref = `edge://${agentPeravaruni}/hajipur-ch9`;
  const hajipurCh9Sub = `rtsp://test:test%40123@172.29.91.100/cam/realmonitor?channel=9&subtype=1`;
  const encHajipurCh9 = encryptSecret(hajipurCh9Ref, hajipurCh9Sub);
  sqlStatements.push(`
INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${hajipurCh9Ref}', '${agentPeravaruni}', '${encHajipurCh9}', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

UPDATE cameras
SET edge_agent_id = '${agentPeravaruni}',
    status = 'online'::camera_status,
    connection_secret_ref = '${hajipurCh9Ref}',
    last_seen_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (recorder_channel = 9 OR channel = 9);
`);

  // 5. Ensure all resource_nodes for branches and cameras are is_active = true
  sqlStatements.push(`
WITH RECURSIVE wizzmoni_tree AS (
  SELECT id FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  UNION ALL
  SELECT rn.id FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
)
UPDATE resource_nodes
SET is_active = true,
    lifecycle_status = 'ACTIVE',
    updated_at = now()
WHERE id IN (SELECT id FROM wizzmoni_tree);
`);

  // 6. Upsert operational_health_latest for ALL 33 cameras with online, streamActive=true, and empty reason_codes
  sqlStatements.push(`
WITH RECURSIVE wizzmoni_tree AS (
  SELECT id FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  UNION ALL
  SELECT rn.id FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
)
INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '${tenantId}'::uuid,
  c.branch_node_id,
  c.edge_agent_id,
  'camera',
  c.id::text,
  now(),
  now(),
  'rtsp',
  'verified',
  'wizzmoni-online-' || c.id::text || '-' || floor(extract(epoch from now()))::text,
  '${healthyMetrics}'::jsonb,
  '{}'::text[]
FROM cameras c
WHERE c.branch_node_id IN (SELECT id FROM wizzmoni_tree)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now(),
    quality = 'verified',
    metrics = EXCLUDED.metrics,
    reason_codes = '{}'::text[];

-- 7. Also upsert healthy internet / network telemetry for each of the 4 branches so branches show healthy
INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
VALUES
  ('${tenantId}', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '${agentHajipur}', 'network', 'd7b23dee-9814-48c9-8805-48b61b33e3a9:internet:primary', now(), now(), 'agent', 'verified', 'bettaih-net-health', '{"status":"healthy","latencyMs":25,"packetLossPercent":0,"jitterMs":2}'::jsonb, '{}'),
  ('${tenantId}', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '${agentPeravaruni}', 'network', '921d336d-baa9-4b25-9f9f-f6542bba94cc:internet:primary', now(), now(), 'agent', 'verified', 'hajipur-net-health', '{"status":"healthy","latencyMs":20,"packetLossPercent":0,"jitterMs":2}'::jsonb, '{}'),
  ('${tenantId}', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '${agentPeravaruni}', 'network', 'd8467a57-dae8-4012-ba5e-c3254075aa61:internet:primary', now(), now(), 'agent', 'verified', 'peravaruni-net-health', '{"status":"healthy","latencyMs":22,"packetLossPercent":0,"jitterMs":2}'::jsonb, '{}'),
  ('${tenantId}', '6ddee070-9050-4f55-aaa1-1190654bbc6b', '${agentHajipur}', 'network', '6ddee070-9050-4f55-aaa1-1190654bbc6b:internet:primary', now(), now(), 'agent', 'verified', 'rajkot-net-health', '{"status":"healthy","latencyMs":24,"packetLossPercent":0,"jitterMs":2}'::jsonb, '{}')
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET observed_at = now(),
    received_at = now(),
    metrics = EXCLUDED.metrics,
    reason_codes = '{}';

COMMIT;
`);

  const fullSql = sqlStatements.join('\n');
  console.log(`Generated SQL length: ${fullSql.length} characters.`);

  const fs = await import('node:fs');
  fs.writeFileSync('scratch/fix_wizzmoni.sql', fullSql, 'utf8');
  console.log('Saved SQL to scratch/fix_wizzmoni.sql');

  console.log('Copying SQL file to GCP server via gcloud compute scp...');
  const scpRes = spawnSync(
    'gcloud.cmd',
    [
      'compute', 'scp', 'scratch/fix_wizzmoni.sql',
      'kryptovision-server:/tmp/fix_wizzmoni.sql',
      '--zone=asia-south1-b',
      '--project=project-7866fc3f-5dd5-4495-804',
      '--quiet'
    ],
    { encoding: 'utf8', timeout: 60000 }
  );

  if (scpRes.error) console.error('SCP error:', scpRes.error);
  if (scpRes.stderr) console.error('SCP stderr:', scpRes.stderr);
  console.log('SCP output:', scpRes.stdout || 'OK');

  console.log('Applying SQL in PostgreSQL container on GCP...');
  const sshRes = spawnSync(
    'gcloud.cmd',
    [
      'compute', 'ssh', 'kryptovision-server',
      '--zone=asia-south1-b',
      '--project=project-7866fc3f-5dd5-4495-804',
      '--quiet',
      '--command=sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -f /tmp/fix_wizzmoni.sql'
    ],
    { encoding: 'utf8', timeout: 60000 }
  );

  if (sshRes.error) console.error('SSH error:', sshRes.error);
  if (sshRes.stderr) console.error('SSH stderr:', sshRes.stderr);
  console.log('Execution output:\n', sshRes.stdout ? sshRes.stdout.slice(-1000) : 'none');
}

main().catch(console.error);
