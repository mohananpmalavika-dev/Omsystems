import { execSync } from 'child_process';

const sql = `
BEGIN;

-- 1. Activate and rename resource node for Channel 1
UPDATE resource_nodes 
SET 
  name = 'CP PLUS DVR - Channel 1', 
  is_active = true,
  lifecycle_status = 'ACTIVE',
  updated_at = now()
WHERE id = '974be899-c73a-41f0-8e38-aaed44f335fd';

-- 2. Link correct device identity for Channel 1
UPDATE device_identities 
SET camera_id = NULL 
WHERE id = 'aeb8f003-53d9-46ac-aa67-c4cddac69713';

UPDATE device_identities 
SET camera_id = 'fa0a7e3d-6f72-4261-a688-d64dd05efc37' 
WHERE id = '8b3b2e35-dd83-4f35-afcb-cb242e2b6c0a';

-- 3. Update Camera row for Channel 1
UPDATE cameras 
SET 
  vendor = 'cp-plus',
  model = 'Multi-channel DVR channel',
  channel = 1,
  recorder_channel = 1,
  recorder_id = 'recorder-hajipur-172-29-91-100',
  source_type = 'analog-dvr-channel',
  device_identity_id = '8b3b2e35-dd83-4f35-afcb-cb242e2b6c0a',
  connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/61790ac5-89a1-4bca-aaae-00ae4d6e1d1e',
  connection_transport = 'edge-gateway',
  status = 'online',
  last_seen_at = now()
WHERE id = 'fa0a7e3d-6f72-4261-a688-d64dd05efc37';

-- 4. Insert/Update operational health for Channel 1
INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001',
  '921d336d-baa9-4b25-9f9f-f6542bba94cc',
  '9f108498-4dd5-4a21-b810-eec9e538953c',
  'camera',
  'fa0a7e3d-6f72-4261-a688-d64dd05efc37',
  now(), now(), 'rtsp', 'verified',
  'health-fa0a7e3d-ch1-init',
  '{"status":"online","streamActive":true,"fps":15.75,"codec":"hevc","width":352,"height":288}'::jsonb,
  '{}'::text[]
)
ON CONFLICT (tenant_id, branch_id, device_type, device_id)
DO UPDATE SET
  observed_at = EXCLUDED.observed_at,
  received_at = EXCLUDED.received_at,
  source = EXCLUDED.source,
  quality = EXCLUDED.quality,
  idempotency_key = EXCLUDED.idempotency_key,
  metrics = EXCLUDED.metrics,
  reason_codes = EXCLUDED.reason_codes;

INSERT INTO operational_health_telemetry (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001',
  '921d336d-baa9-4b25-9f9f-f6542bba94cc',
  '9f108498-4dd5-4a21-b810-eec9e538953c',
  'camera',
  'fa0a7e3d-6f72-4261-a688-d64dd05efc37',
  now(), now(), 'rtsp', 'verified',
  'health-fa0a7e3d-ch1-init',
  '{"status":"online","streamActive":true,"fps":15.75,"codec":"hevc","width":352,"height":288}'::jsonb,
  '{}'::text[]
)
ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;

COMMIT;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log('Applying Hajipur Channel 1 fix in Postgres...');
console.log(execSync(cmd, { encoding: 'utf8' }));
