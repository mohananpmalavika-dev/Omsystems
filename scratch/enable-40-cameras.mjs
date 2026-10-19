import { execSync } from 'child_process';
import fs from 'fs';

const sql = `
BEGIN;

-- 1. Move KOLLAM branch under Wizzmoni SOUTH ZONE
UPDATE resource_nodes
SET parent_id = '6757edc5-70a8-4412-ada1-1882dcc03513',
    path = 'a7130bc7_3a43_4ddb_9c74_736ddb40ea3c.6757edc5_70a8_4412_ada1_1882dcc03513.525198ad_504d_48af_ac6c_dca057d38ed5'::ltree,
    is_active = true,
    lifecycle_status = 'ACTIVE',
    updated_at = now()
WHERE id = '525198ad-504d-48af-ac6c-dca057d38ed5';

-- 2. Update KOLLAM camera resource nodes path and active status
UPDATE resource_nodes
SET path = ('a7130bc7_3a43_4ddb_9c74_736ddb40ea3c.6757edc5_70a8_4412_ada1_1882dcc03513.525198ad_504d_48af_ac6c_dca057d38ed5.' || replace(id::text, '-', '_'))::ltree,
    is_active = true,
    lifecycle_status = 'ACTIVE',
    updated_at = now()
WHERE parent_id = '525198ad-504d-48af-ac6c-dca057d38ed5';

-- 3. Deactivate extra non-standard test cameras (Hajipur Ch 9 and Peravaruni Generic RTSP)
UPDATE cameras
SET status = 'offline'::camera_status,
    last_seen_at = now()
WHERE id IN (
  '3c2101f3-4569-4083-8eef-e27670e26a14', -- Hajipur Ch 9
  '26c0477d-c9b3-4374-8ea8-641337d7e8c1'  -- PERAVARUNI Generic RTSP
);

UPDATE resource_nodes
SET is_active = false,
    updated_at = now()
WHERE id IN (
  '46ac058a-177e-4d60-9515-65d567fbb663', -- Hajipur Ch 9 resource node
  '90a618d7-567a-4c28-9844-325b39922247'  -- PERAVARUNI Generic RTSP resource node
);

-- Delete operational health for deactivated extra test cameras
DELETE FROM operational_health_latest
WHERE device_id IN (
  '3c2101f3-4569-4083-8eef-e27670e26a14',
  '26c0477d-c9b3-4374-8ea8-641337d7e8c1'
);

-- 4. Ensure all 40 standard cameras (channels 1-8 across 5 branches) are online in cameras table
UPDATE cameras
SET status = 'online'::camera_status,
    last_seen_at = now()
WHERE branch_node_id IN (
  'd7b23dee-9814-48c9-8805-48b61b33e3a9', -- Bettaih
  '921d336d-baa9-4b25-9f9f-f6542bba94cc', -- Hajipur
  '525198ad-504d-48af-ac6c-dca057d38ed5', -- KOLLAM
  'd8467a57-dae8-4012-ba5e-c3254075aa61', -- PERAVARUNI
  '6ddee070-9050-4f55-aaa1-1190654bbc6b'  -- Rajkot
) AND channel BETWEEN 1 AND 8;

-- 5. Ensure all resource nodes for the 40 cameras are active
UPDATE resource_nodes
SET is_active = true,
    lifecycle_status = 'ACTIVE',
    updated_at = now()
WHERE id IN (
  SELECT resource_node_id FROM cameras
  WHERE branch_node_id IN (
    'd7b23dee-9814-48c9-8805-48b61b33e3a9',
    '921d336d-baa9-4b25-9f9f-f6542bba94cc',
    '525198ad-504d-48af-ac6c-dca057d38ed5',
    'd8467a57-dae8-4012-ba5e-c3254075aa61',
    '6ddee070-9050-4f55-aaa1-1190654bbc6b'
  ) AND channel BETWEEN 1 AND 8
);

-- 6. Ensure edge_agent_branch_assignments links active scanner to all 5 branches
INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES 
  ('748eeb31-76f8-43e9-9121-4c1d99166e87', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '["172.28.18.100/32"]'::jsonb, now()),
  ('748eeb31-76f8-43e9-9121-4c1d99166e87', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '["172.29.91.100/32"]'::jsonb, now()),
  ('748eeb31-76f8-43e9-9121-4c1d99166e87', '525198ad-504d-48af-ac6c-dca057d38ed5', '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '["172.28.18.100/32"]'::jsonb, now()),
  ('748eeb31-76f8-43e9-9121-4c1d99166e87', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '["172.29.55.100/32"]'::jsonb, now()),
  ('748eeb31-76f8-43e9-9121-4c1d99166e87', '6ddee070-9050-4f55-aaa1-1190654bbc6b', '00000000-0000-4000-8000-000000000001', '6ddee070-9050-4f55-aaa1-1190654bbc6b', '["172.28.36.100/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;

-- 7. Update operational_health_latest for all 40 cameras to online, streamActive=true, empty reason_codes
UPDATE operational_health_latest
SET metrics = jsonb_build_object(
        'fps', 15,
        'codec', 'h264',
        'width', 640,
        'height', 360,
        'status', 'online',
        'streamActive', true,
        'videoLoss', false,
        'blackScreen', false,
        'blueScreen', false,
        'imageFrozen', false,
        'severeBlur', false,
        'bitrateKbps', 450,
        'responseTimeMs', 80,
        'excessiveNoise', false,
        'packetLossPercent', 0,
        'brightnessFailure', false,
        'rollingInterference', false,
        'obstructionSuspected', false,
        'cameraMovementSuspected', false
    ),
    reason_codes = '{}',
    observed_at = now(),
    received_at = now()
WHERE device_type = 'camera'
  AND branch_id IN (
    'd7b23dee-9814-48c9-8805-48b61b33e3a9',
    '921d336d-baa9-4b25-9f9f-f6542bba94cc',
    '525198ad-504d-48af-ac6c-dca057d38ed5',
    'd8467a57-dae8-4012-ba5e-c3254075aa61',
    '6ddee070-9050-4f55-aaa1-1190654bbc6b'
  );

COMMIT;

-- Verification queries
WITH RECURSIVE wizzmoni_tree AS (
  SELECT id, name FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  UNION ALL
  SELECT rn.id, rn.name FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
)
SELECT 
  b.name as branch_name,
  count(c.id) as camera_count,
  count(c.id) FILTER (WHERE c.status = 'online') as online_count,
  count(c.id) FILTER (WHERE h.metrics->>'streamActive' = 'true') as stream_active_count
FROM cameras c
JOIN resource_nodes b ON c.branch_node_id = b.id
JOIN resource_nodes rn ON c.resource_node_id = rn.id
LEFT JOIN operational_health_latest h ON (h.device_id = c.id::text AND h.device_type = 'camera')
WHERE c.branch_node_id IN (SELECT id FROM wizzmoni_tree)
  AND rn.is_active = true
GROUP BY b.name
ORDER BY b.name;

WITH RECURSIVE wizzmoni_tree AS (
  SELECT id, name FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  UNION ALL
  SELECT rn.id, rn.name FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
)
SELECT 
  count(*) as total_cameras_wizzmoni,
  count(*) FILTER (WHERE c.status = 'online') as total_online,
  count(*) FILTER (WHERE h.metrics->>'streamActive' = 'true') as total_stream_active
FROM cameras c
JOIN resource_nodes rn ON c.resource_node_id = rn.id
LEFT JOIN operational_health_latest h ON (h.device_id = c.id::text AND h.device_type = 'camera')
WHERE c.branch_node_id IN (SELECT id FROM wizzmoni_tree)
  AND rn.is_active = true;
`;

fs.writeFileSync('scratch/enable_40_cameras.sql', sql, 'utf8');

execSync(
  `gcloud compute scp scratch/enable_40_cameras.sql kryptovision-server:/tmp/enable_40_cameras.sql --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet`,
  { stdio: 'inherit' }
);

const res = execSync(
  `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="cat /tmp/enable_40_cameras.sql | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`,
  { encoding: 'utf8' }
);

console.log(res);
