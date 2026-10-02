#!/usr/bin/env bash
set -euo pipefail
sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -P pager=off <<'SQL'
SELECT n.name AS branch, count(*) AS cameras, count(c.recorder_id) AS recorder_mapped
FROM cameras c JOIN resource_nodes n ON n.id = c.branch_node_id GROUP BY n.name ORDER BY n.name;
SELECT n.name AS branch, c.id, c.model, c.recorder_id, c.recorder_channel, c.status
FROM cameras c JOIN resource_nodes n ON n.id = c.branch_node_id ORDER BY n.name, c.recorder_channel;
SELECT column_name FROM information_schema.columns WHERE table_name = 'operational_health_latest' ORDER BY ordinal_position;
SELECT n.name AS branch, t.device_id, t.observed_at, t.source, t.quality,
  t.metrics->>'model' AS model, t.metrics->>'capacityBytes' AS capacity,
  t.metrics->>'usedBytes' AS used, t.metrics->>'availableBytes' AS free,
  t.metrics->>'slotStatus' AS slot, t.metrics->>'writeVerification' AS write_access,
  t.reason_codes
FROM operational_health_latest t JOIN resource_nodes n ON n.id = t.branch_id
WHERE t.device_type = 'disk' AND t.idempotency_key NOT LIKE 'auto-storage:%'
ORDER BY n.name, t.device_id;
SELECT n.name AS branch, e.name, e.status, e.agent_version, e.last_seen_at
FROM edge_agents e JOIN resource_nodes n ON n.id = e.branch_node_id ORDER BY n.name;
SELECT table_name, column_name FROM information_schema.columns
WHERE table_name IN ('camera_discoveries','device_inventory','recorder_profiles') ORDER BY table_name, ordinal_position;
SELECT n.name AS branch, t.device_id, t.observed_at, t.quality, t.reason_codes,
 t.metrics->>'storageProbeStatus' AS storage_probe, t.metrics->>'hddTelemetryStatus' AS hdd_telemetry,
 t.metrics->>'status' AS status, t.metrics->>'model' AS model
FROM operational_health_latest t JOIN resource_nodes n ON n.id = t.branch_id WHERE t.device_type = 'recorder';
SELECT n.name AS branch, c.id AS camera_id, c.source_type, c.ip_address,
 d.recorder_id AS discovered_recorder, d.recorder_channel AS discovered_channel,
 d.source_type AS discovered_source, d.stream_verified, d.status
FROM cameras c JOIN resource_nodes n ON n.id = c.branch_node_id
LEFT JOIN camera_discoveries d ON d.id::text = substring(c.connection_secret_ref from '^edge://[^/]+/(.+)$')
ORDER BY n.name, c.id;
SQL
