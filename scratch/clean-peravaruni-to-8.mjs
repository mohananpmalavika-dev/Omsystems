import { execSync } from 'node:child_process';
import fs from 'node:fs';

const branchId = 'd8467a57-dae8-4012-ba5e-c3254075aa61';

const pairs = [
  {
    ch: 1,
    origId: '4d3caa3d-e03d-4689-81a6-a10e6f26329c',
    dupId: '9c8c0914-452c-44a3-8ca3-7e07482fbbce',
    dupNodeId: '264e7203-1399-46fa-a651-750a3ab22499'
  },
  {
    ch: 2,
    origId: 'a66bbc0b-1d47-4462-9cf7-94b5b35824df',
    dupId: 'b11c23c5-c0e2-49c4-bcb7-19bcfebbcd66',
    dupNodeId: 'a69b476e-b355-4e50-bce9-a52cd0ff68ab'
  },
  {
    ch: 3,
    origId: '940fb6f4-7c41-4c92-b4f1-85a459ebb38d',
    dupId: 'fb9fbf75-4009-4ef1-9e13-a85d4042f410',
    dupNodeId: '7939cb15-4426-4463-a519-031644a7edb3'
  },
  {
    ch: 4,
    origId: '1fa8cd44-c782-40a3-81f2-a933fb2b1d76',
    dupId: '6a949b74-113a-4545-9566-3813fd96540b',
    dupNodeId: 'edf30416-b410-4e34-b3d2-aa265075b2af'
  },
  {
    ch: 5,
    origId: '9cf710ef-1a0b-444b-9c30-abbac95948fe',
    dupId: 'c5a1b894-900e-486d-a2dc-1ff1e6b956fc',
    dupNodeId: '1a0fd477-e767-4c80-95f9-eb5794e93acc'
  },
  {
    ch: 6,
    origId: 'fc1a1f29-8b1c-4743-a093-40584e1a96a8',
    dupId: '0ab3ebd0-505a-4752-b327-006f208e209e',
    dupNodeId: '93f70b14-2def-47f1-8043-505b59deed95'
  },
  {
    ch: 7,
    origId: '3baa601f-67e0-4e0e-905d-0688df725bf1',
    dupId: 'eda4dbac-3fc9-4b83-8e65-d1993dbb0be8',
    dupNodeId: 'f3e66c24-3327-43bd-a13a-b887385ff816'
  },
  {
    ch: 8,
    origId: '14d869da-4642-4d74-9de0-c4c6c2be4488',
    dupId: 'b89d7170-5982-41b5-9a8a-274ddc31b836',
    dupNodeId: '9cdc53e0-73bc-437f-b38d-adab5aae3318'
  }
];

const dupCameraIds = pairs.map(p => `'${p.dupId}'`).join(',');
const dupNodeIds = pairs.map(p => `'${p.dupNodeId}'`).join(',');

let sql = `
BEGIN;

-- Lock duplicate camera rows to prevent concurrent inserts into child tables
SELECT id FROM cameras WHERE id IN (${dupCameraIds}) FOR UPDATE;

-- 1. Reassign alerts, events, and live sessions to original cameras
`;

for (const pair of pairs) {
  sql += `
UPDATE analytics_alerts a
SET camera_id = '${pair.origId}',
    rule_id = COALESCE(
      (SELECT orig_r.id FROM analytics_rules orig_r 
       JOIN analytics_rules dup_r ON dup_r.id = a.rule_id 
       WHERE orig_r.camera_id = '${pair.origId}' AND orig_r.detection_type = dup_r.detection_type LIMIT 1),
      (SELECT id FROM analytics_rules WHERE camera_id = '${pair.origId}' LIMIT 1)
    )
WHERE a.camera_id = '${pair.dupId}';

UPDATE analytics_events e
SET camera_id = '${pair.origId}',
    primary_rule_id = COALESCE(
      (SELECT orig_r.id FROM analytics_rules orig_r 
       JOIN analytics_rules dup_r ON dup_r.id = e.primary_rule_id 
       WHERE orig_r.camera_id = '${pair.origId}' AND orig_r.detection_type = dup_r.detection_type LIMIT 1),
      (SELECT id FROM analytics_rules WHERE camera_id = '${pair.origId}' LIMIT 1)
    )
WHERE e.camera_id = '${pair.dupId}';

UPDATE detected_objects SET camera_id = '${pair.origId}' WHERE camera_id = '${pair.dupId}';
UPDATE live_sessions SET camera_id = '${pair.origId}' WHERE camera_id = '${pair.dupId}';
`;
}

sql += `
-- 2. Delete recording jobs for duplicates
DELETE FROM recording_jobs WHERE camera_id IN (${dupCameraIds});

-- 3. Delete live sessions and health telemetry for duplicates
DELETE FROM live_sessions WHERE camera_id IN (${dupCameraIds});
DELETE FROM operational_health_telemetry WHERE device_id IN (${dupCameraIds});
DELETE FROM operational_health_latest WHERE device_id IN (${dupCameraIds});

-- 4. Delete duplicate rules
DELETE FROM analytics_rules WHERE camera_id IN (${dupCameraIds});

-- 5. Delete duplicate cameras (device_identities.camera_id will ON DELETE SET NULL automatically)
DELETE FROM cameras WHERE id IN (${dupCameraIds});

-- 8. Deactivate duplicate resource nodes
UPDATE resource_nodes SET is_active = false WHERE id IN (${dupNodeIds});

-- 9. Deactivate any other unattached camera nodes under Peravaruni
UPDATE resource_nodes 
SET is_active = false 
WHERE parent_id = '${branchId}' 
  AND id NOT IN (SELECT resource_node_id FROM cameras WHERE branch_node_id = '${branchId}')
  AND node_type = 'camera';

COMMIT;

-- Verification
SELECT count(*) as total_peravaruni_cameras FROM cameras WHERE branch_node_id = '${branchId}';
SELECT c.channel, rn.name, c.status, c.ip_address, c.recorder_id, c.edge_agent_id
FROM cameras c
JOIN resource_nodes rn ON rn.id = c.resource_node_id
WHERE c.branch_node_id = '${branchId}'
ORDER BY c.channel;
`;

fs.writeFileSync('scratch/clean-peravaruni-to-8.sql', sql, 'utf8');
console.log('Uploading clean SQL to kryptovision-server...');
execSync(`gcloud compute scp scratch/clean-peravaruni-to-8.sql kryptovision-server:/tmp/clean-peravaruni-to-8.sql --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet`);

console.log('Executing transaction...');
const output = execSync(`gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid < /tmp/clean-peravaruni-to-8.sql"`, { encoding: 'utf8' });

console.log(output);
