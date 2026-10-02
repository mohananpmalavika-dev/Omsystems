#!/usr/bin/env bash
set -euo pipefail
sudo docker exec -i sentinel-gcp-postgres psql -v ON_ERROR_STOP=1 -U sentinel_admin -d sentinel_grid -P pager=off <<'SQL'
BEGIN;
UPDATE cameras c SET recorder_id = d.recorder_id, recorder_channel = d.recorder_channel,
 recorder_serial_number = COALESCE(c.recorder_serial_number, d.recorder_serial_number)
FROM camera_discoveries d
WHERE d.id::text = substring(c.connection_secret_ref from '^edge://[^/]+/(.+)$')
 AND c.branch_node_id = d.branch_node_id AND c.edge_agent_id = d.edge_agent_id
 AND c.ip_address = d.ip_address AND c.source_type = 'analog-dvr-channel'
 AND d.source_type = 'analog-dvr-channel' AND d.stream_verified = true
 AND d.recorder_id IS NOT NULL AND d.recorder_channel > 0 AND c.recorder_id IS NULL
RETURNING c.id, c.recorder_id, c.recorder_channel;
COMMIT;
INSERT INTO edge_commands (tenant_id, branch_node_id, edge_agent_id, command_type, payload, requested_by)
SELECT e.tenant_id, e.branch_node_id, e.id, 'probe-recorder', jsonb_build_object('recorderId', r.recorder_id),
 '00000000-0000-4000-8000-000000000201'::uuid
FROM (
 SELECT DISTINCT branch_node_id AS branch_id, edge_agent_id, recorder_id FROM cameras WHERE recorder_id IS NOT NULL
 UNION
 SELECT branch_id, edge_agent_id, device_id FROM operational_health_latest WHERE device_type = 'recorder'
) r JOIN edge_agents e ON e.id = r.edge_agent_id AND e.branch_node_id = r.branch_id
WHERE e.credential_revoked_at IS NULL AND e.status = 'online'
 AND NOT EXISTS (SELECT 1 FROM edge_commands cmd WHERE cmd.edge_agent_id = e.id
  AND cmd.command_type = 'probe-recorder' AND cmd.payload->>'recorderId' = r.recorder_id
  AND cmd.requested_at > now() - interval '5 minutes')
RETURNING id, edge_agent_id, payload->>'recorderId' AS recorder, status;
SQL
