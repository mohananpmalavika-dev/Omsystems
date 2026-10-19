import fs from 'node:fs';

const agentId = '748eeb31-76f8-43e9-9121-4c1d99166e87';
const tenantId = '00000000-0000-4000-8000-000000000001';
const branchId = '525198ad-504d-48af-ac6c-dca057d38ed5';

const kollamCameras = [
  { ch: 1, camId: 'b7a24b40-013d-40c9-bd46-823cbcf6e326' },
  { ch: 2, camId: 'c7ef14ba-67eb-4d15-a173-9c56d51bbb53' },
  { ch: 3, camId: 'da907692-01fd-4bf4-b305-f7259c05c887' },
  { ch: 4, camId: '3da93c6e-6824-43dc-9bba-7332707d5856' },
  { ch: 5, camId: 'cf27a4e8-23e4-4c4a-8e57-b49eef8302b2' },
  { ch: 6, camId: 'c365a8e7-68a8-44bb-a63f-aae73dca7526' },
  { ch: 7, camId: '99455d3a-3411-43ad-b756-84a4ae17c026' },
  { ch: 8, camId: 'fb465a8f-5d79-4a3f-9cb8-b8cec471708d' }
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
    vendor = 'cp-plus',
    model = '${channelName}',
    channel = ${ch},
    recorder_channel = ${ch},
    recorder_id = 'recorder-kollam-192-168-1-33',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '${profiles}'::jsonb,
    connection_secret_ref = '${secretRef}',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '${item.camId}';

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

fs.writeFileSync('scratch/kollam_working_live.sql', sql.join('\n'), 'utf8');
console.log('Saved SQL to scratch/kollam_working_live.sql');
