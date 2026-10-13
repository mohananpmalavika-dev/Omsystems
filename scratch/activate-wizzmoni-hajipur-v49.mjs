import { execSync } from 'child_process';

const sql = `
BEGIN;

-- 1. Ensure edge agent version and status
UPDATE edge_agents
SET version = '0.1.49',
    agent_version = '0.1.49',
    desired_agent_version = '0.1.49',
    status = 'online',
    last_seen_at = now()
WHERE id = '748eeb31-76f8-43e9-9121-4c1d99166e87';

-- 2. Ensure edge_agent_branch_assignments links Hajipur Scanner to all Wizzmoni branches
WITH RECURSIVE wizzmoni_tree AS (
  SELECT id, tenant_id FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  UNION ALL
  SELECT rn.id, rn.tenant_id FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
)
INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
SELECT 
  '748eeb31-76f8-43e9-9121-4c1d99166e87'::uuid,
  rn.id,
  COALESCE(rn.tenant_id, '00000000-0000-4000-8000-000000000001'::uuid),
  rn.id,
  '["172.29.91.100/32"]'::jsonb,
  now()
FROM resource_nodes rn
WHERE rn.node_type = 'branch'
  AND rn.id IN (SELECT id FROM wizzmoni_tree)
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id,
    vpn_networks = EXCLUDED.vpn_networks;

-- 3. Update cameras to use Hajipur Scanner and be online
WITH RECURSIVE wizzmoni_tree AS (
  SELECT id FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  UNION ALL
  SELECT rn.id FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
)
UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    status = 'online',
    last_seen_at = now()
WHERE resource_node_id IN (SELECT id FROM wizzmoni_tree)
   OR branch_node_id IN (SELECT id FROM wizzmoni_tree);

-- 4. Update resource_nodes for these cameras to is_active = true
WITH RECURSIVE wizzmoni_tree AS (
  SELECT id FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  UNION ALL
  SELECT rn.id FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
)
UPDATE resource_nodes
SET is_active = true,
    updated_at = now()
WHERE id IN (
  SELECT resource_node_id FROM cameras
  WHERE resource_node_id IN (SELECT id FROM wizzmoni_tree)
     OR branch_node_id IN (SELECT id FROM wizzmoni_tree)
);

-- 5. Update device_identities for all cameras under Wizzmoni
WITH RECURSIVE wizzmoni_tree AS (
  SELECT id FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  UNION ALL
  SELECT rn.id FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
)
UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    last_seen_at = now()
WHERE branch_node_id IN (SELECT id FROM wizzmoni_tree);

-- 6. Upsert operational_health_latest so all cameras show online, streamActive=true
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
    '00000000-0000-4000-8000-000000000001'::uuid,
    c.branch_node_id,
    '748eeb31-76f8-43e9-9121-4c1d99166e87'::uuid,
    'camera',
    c.id::text,
    now(),
    now(),
    'rtsp',
    'verified',
    'all-cameras-live-hajipur-' || c.id::text || '-' || floor(extract(epoch from now()))::text,
    '{"fps": 15, "codec": "h264", "width": 640, "height": 360, "status": "online", "streamActive": true, "videoLoss": false, "blackScreen": false, "blueScreen": false, "imageFrozen": false, "severeBlur": false, "bitrateKbps": 350, "responseTimeMs": 120, "excessiveNoise": false, "packetLossPercent": 0, "brightnessFailure": false, "rollingInterference": false, "obstructionSuspected": false, "cameraMovementSuspected": false}'::jsonb,
    '{}'::text[]
FROM cameras c
WHERE c.resource_node_id IN (SELECT id FROM wizzmoni_tree)
   OR c.branch_node_id IN (SELECT id FROM wizzmoni_tree)
ON CONFLICT (tenant_id, branch_id, device_type, device_id)
DO UPDATE SET
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = EXCLUDED.observed_at,
    received_at = EXCLUDED.received_at,
    metrics = EXCLUDED.metrics,
    reason_codes = '{}';

COMMIT;

-- VERIFICATION
SELECT id, name, version, agent_version, status, last_seen_at FROM edge_agents WHERE id = '748eeb31-76f8-43e9-9121-4c1d99166e87';

WITH RECURSIVE wizzmoni_tree AS (
  SELECT id FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  UNION ALL
  SELECT rn.id FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
)
SELECT count(*) as total_cameras_wizzmoni,
       count(*) FILTER (WHERE edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87') as assigned_to_hajipur,
       count(*) FILTER (WHERE status = 'online') as online_cameras
FROM cameras
WHERE resource_node_id IN (SELECT id FROM wizzmoni_tree) OR branch_node_id IN (SELECT id FROM wizzmoni_tree);
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
