#!/usr/bin/env bash
set -euo pipefail
sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -P pager=off <<'SQL'
SELECT device_id, observed_at, quality, metrics->>'devicePath' AS disk,
 metrics->>'capacityBytes' AS capacity, metrics->>'usedBytes' AS used,
 metrics->>'availableBytes' AS free, metrics->>'slotStatus' AS access,
 metrics->>'writeVerification' AS recording_write
FROM operational_health_latest
WHERE device_id = 'recorder-192.168.29.171:disk:1';
SELECT name, version, status, last_seen_at FROM edge_agents
WHERE id IN ('e9f439e5-e7f1-414f-9642-cb8c3eb3a3b3', '9f108498-4dd5-4a21-b810-eec9e538953c');
SELECT e.name, c.command_type, c.status, c.error, c.requested_at
FROM edge_commands c JOIN edge_agents e ON e.id = c.edge_agent_id
WHERE c.command_type IN ('probe-recorder','restart-agent')
 AND c.requested_at > now() - interval '1 day'
ORDER BY c.requested_at DESC LIMIT 10;
SQL
