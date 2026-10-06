#!/usr/bin/env bash
# Read-only camera identity/configuration lookup; no credentials or footage.
set -eu
sudo docker exec -i sentinel-gcp-postgres psql -v ON_ERROR_STOP=1 -U sentinel_admin -d sentinel_grid <<'SQL'
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
SELECT id,name,parent_id FROM resource_nodes WHERE name ILIKE '%bett%';
SELECT c.id,c.recorder_channel,c.channel,c.branch_node_id,n.name AS camera_name,b.name AS branch_name
FROM cameras c LEFT JOIN resource_nodes n ON n.id=c.resource_node_id
LEFT JOIN resource_nodes b ON b.id=c.branch_node_id
WHERE c.branch_node_id='00000000-0000-4000-8000-000000000104'
   OR b.name ILIKE '%bett%' OR n.name ILIKE '%bett%'
ORDER BY c.recorder_channel,c.channel;
COMMIT;
SQL
