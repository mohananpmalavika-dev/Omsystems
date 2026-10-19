import { execSync } from 'child_process';
import fs from 'fs';

const sql = `
BEGIN;

-- 1. Move KOLLAM branch back under Local Region (OM Systems)
UPDATE resource_nodes
SET parent_id = '00000000-0000-4000-8000-000000000103',
    path = 'company.operations.local_region.525198ad_504d_48af_ac6c_dca057d38ed5'::ltree,
    updated_at = now()
WHERE id = '525198ad-504d-48af-ac6c-dca057d38ed5';

-- 2. Update KOLLAM camera resource nodes path back under Local Region
UPDATE resource_nodes
SET path = ('company.operations.local_region.525198ad_504d_48af_ac6c_dca057d38ed5.' || replace(id::text, '-', '_'))::ltree,
    updated_at = now()
WHERE parent_id = '525198ad-504d-48af-ac6c-dca057d38ed5';

COMMIT;

-- Verification: Cameras under Wizzmoni
WITH RECURSIVE wizzmoni_tree AS (
  SELECT id, name FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  UNION ALL
  SELECT rn.id, rn.name FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
)
SELECT 
  b.name as branch_name,
  count(c.id) as camera_count,
  count(c.id) FILTER (WHERE c.status = 'online') as online_count
FROM cameras c
JOIN resource_nodes b ON c.branch_node_id = b.id
JOIN resource_nodes rn ON c.resource_node_id = rn.id
WHERE c.branch_node_id IN (SELECT id FROM wizzmoni_tree)
  AND rn.is_active = true
GROUP BY b.name
ORDER BY b.name;

-- Verification: Location of KOLLAM branch
SELECT rn.id, rn.name, p.name as parent_name, rn.path
FROM resource_nodes rn
LEFT JOIN resource_nodes p ON rn.parent_id = p.id
WHERE rn.id = '525198ad-504d-48af-ac6c-dca057d38ed5';
`;

fs.writeFileSync('scratch/remove_kollam.sql', sql, 'utf8');

execSync(
  `gcloud compute scp scratch/remove_kollam.sql kryptovision-server:/tmp/remove_kollam.sql --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet`,
  { stdio: 'inherit' }
);

const res = execSync(
  `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="cat /tmp/remove_kollam.sql | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`,
  { encoding: 'utf8' }
);

console.log(res);
