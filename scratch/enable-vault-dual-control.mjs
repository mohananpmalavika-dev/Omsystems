import { execSync } from 'child_process';

const sql = `
BEGIN;

-- 1. Enable dual-control-verification on all designated vault cameras
UPDATE analytics_rules ar
SET enabled = true, updated_at = now()
FROM cameras c
WHERE ar.camera_id = c.id
  AND ar.detection_type = 'dual-control-verification'
  AND (
    c.location_type = 'vault'
    OR c.id IN (
      '71c48e75-4e0b-4536-b3e4-85263a6d98ad', -- Bettaih Ch 1
      '88137ebc-8df1-4995-824a-99bfce6c2225', -- Hajipur Ch 6
      '3da93c6e-6824-43dc-9bba-7332707d5856', -- KOLLAM Ch 4
      '3baa601f-67e0-4e0e-905d-0688df725bf1', -- PERAVARUNI Ch 7
      '4d74d7ad-6922-4af0-9f36-420b84879425'  -- Rajkot Ch 8
    )
  );

-- 2. Update NBFC dual-control rule template to ACTIVE with current vault camera IDs
UPDATE nbfc_analytics_rules
SET enabled = true,
    state = 'ACTIVE',
    camera_ids = '["71c48e75-4e0b-4536-b3e4-85263a6d98ad", "88137ebc-8df1-4995-824a-99bfce6c2225", "3da93c6e-6824-43dc-9bba-7332707d5856", "3baa601f-67e0-4e0e-905d-0688df725bf1", "4d74d7ad-6922-4af0-9f36-420b84879425"]'::jsonb,
    branch_ids = '["d7b23dee-9814-48c9-8805-48b61b33e3a9", "921d336d-baa9-4b25-9f9f-f6542bba94cc", "525198ad-504d-48af-ac6c-dca057d38ed5", "d8467a57-dae8-4012-ba5e-c3254075aa61", "6ddee070-9050-4f55-aaa1-1190654bbc6b"]'::jsonb,
    updated_at = now()
WHERE template_id = 'tmpl-02-minimum-personnel';

-- 3. Unsuppress dual-control alerts in alert_suppression_config
INSERT INTO alert_suppression_config (
  id, tenant_id, branch_id, camera_id, detection_type, suppressed, label, updated_by, updated_at, created_at
) VALUES 
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000001', NULL, NULL, 'dual-control-verification', false, 'Dual control verification in vault area', 'user', now(), now()),
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000001', NULL, NULL, 'dual-control-violation', false, 'Dual control violation in vault area', 'user', now(), now())
ON CONFLICT (tenant_id, branch_id, camera_id, detection_type)
DO UPDATE SET suppressed = false, updated_at = now();

COMMIT;

-- Verification
SELECT ar.id, ar.detection_type, ar.enabled, c.channel, rn.name as camera_name, b.name as branch_name, c.location_type
FROM analytics_rules ar
JOIN cameras c ON ar.camera_id = c.id
JOIN resource_nodes rn ON c.resource_node_id = rn.id
LEFT JOIN resource_nodes b ON c.branch_node_id = b.id
WHERE ar.detection_type = 'dual-control-verification' AND ar.enabled = true
ORDER BY b.name, c.channel;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
