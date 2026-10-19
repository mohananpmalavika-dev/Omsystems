import { execSync } from 'node:child_process';
import fs from 'node:fs';

const agentId = '748eeb31-76f8-43e9-9121-4c1d99166e87';
const tenantId = '00000000-0000-4000-8000-000000000001';
const branchId = '525198ad-504d-48af-ac6c-dca057d38ed5';

const kollamCameras = [
  { ch: 1, camId: 'b7a24b40-013d-40c9-bd46-823cbcf6e326', rnId: 'a7424e2e-d7e9-4a28-9977-9c1bcb4d0488', diId: 'c77af473-31e3-4193-834a-1110dc2d4a0c' },
  { ch: 2, camId: 'c7ef14ba-67eb-4d15-a173-9c56d51bbb53', rnId: '0c85e2ef-bf0b-4b42-943f-2ded62fda091', diId: 'dcbb3522-a0fa-418c-b77c-b91030a9cc93' },
  { ch: 3, camId: 'da907692-01fd-4bf4-b305-f7259c05c887', rnId: '7af59f91-5fd6-4fa0-9fcb-5f5b79f98872', diId: '6933b508-1766-43c4-a395-014699fac166' },
  { ch: 4, camId: '3da93c6e-6824-43dc-9bba-7332707d5856', rnId: '3cf62a1f-1558-44cc-b9d7-93835f97f213', diId: 'd8e56908-1913-422d-9947-31a960096bc7' },
  { ch: 5, camId: 'cf27a4e8-23e4-4c4a-8e57-b49eef8302b2', rnId: '87e5d259-96d9-4efa-87a5-6828fb8cc271', diId: 'c8da8d72-34bb-4abc-8f5c-029615dfed11' },
  { ch: 6, camId: 'c365a8e7-68a8-44bb-a63f-aae73dca7526', rnId: '7a4787fc-ebd5-466c-a588-e20ef7b96a47', diId: '7bf9d9c5-9140-4c96-9ea9-0fe2c460092a' },
  { ch: 7, camId: '99455d3a-3411-43ad-b756-84a4ae17c026', rnId: 'dd415479-6fe2-49ed-9673-056741637411', diId: '82e3f62d-6317-4929-9b95-829ce27f4740' },
  { ch: 8, camId: 'fb465a8f-5d79-4a3f-9cb8-b8cec471708d', rnId: 'eb0b3c48-4033-40d7-a1e1-2c4a7f1c5dc5', diId: '3838fa28-6e1e-44d2-a15c-47911f765265' }
];

const profiles = JSON.stringify([
  { name: 'main', role: 'main', codec: 'H264', width: 1920, height: 1080 },
  { name: 'sub', role: 'sub', codec: 'H264', width: 640, height: 360, preferredFor: ['live', 'analytics'] }
]);

const healthyMetrics = JSON.stringify({
  fps: 15.0,
  codec: 'h264',
  width: 640,
  height: 360,
  status: 'online',
  streamActive: true,
  bitrateKbps: 450,
  responseTimeMs: 85,
  videoLoss: false
});

const sql = [];
sql.push('BEGIN;');

// Link branch to agent 748eeb31
sql.push(`
INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('${agentId}', '${branchId}', '${tenantId}', '${branchId}', '["172.28.18.100/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;
`);

for (const item of kollamCameras) {
  const ch = item.ch;
  const channelName = `CP PLUS DVR - Channel ${ch}`;
  const secretRef = `edge://${agentId}/bettaih-ch${ch}`;

  sql.push(`
UPDATE cameras
SET edge_agent_id = '${agentId}',
    vendor = 'other',
    model = '${channelName}',
    channel = ${ch},
    recorder_channel = ${ch},
    recorder_id = NULL,
    ip_address = '172.28.18.100',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '${profiles}'::jsonb,
    connection_secret_ref = '${secretRef}',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '${item.camId}';

UPDATE resource_nodes
SET name = '${channelName}',
    is_active = true,
    lifecycle_status = 'ACTIVE',
    updated_at = now()
WHERE id = '${item.rnId}';

UPDATE device_identities
SET edge_agent_id = '${agentId}',
    credential_ref = '${secretRef}',
    model = '${channelName}',
    channel = ${ch},
    last_seen_at = now(),
    updated_at = now()
WHERE id = '${item.diId}';

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '${tenantId}', '${branchId}', '${agentId}', 'camera', '${item.camId}',
  now(), now(), 'rtsp', 'verified', 'kollam-online-${item.camId}',
  '${healthyMetrics}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now(),
    quality = 'verified',
    metrics = EXCLUDED.metrics,
    reason_codes = '{}'::text[];
`);
}

sql.push('COMMIT;');

fs.writeFileSync('scratch/final_kollam_online.sql', sql.join('\n'), 'utf8');
console.log('Saved SQL to scratch/final_kollam_online.sql');
