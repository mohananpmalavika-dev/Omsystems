import { execSync } from 'node:child_process';

const duplicateIds = [
  '9c8c0914-452c-44a3-8ca3-7e07482fbbce',
  'b11c23c5-c0e2-49c4-bcb7-19bcfebbcd66',
  'fb9fbf75-4009-4ef1-9e13-a85d4042f410',
  '6a949b74-113a-4545-9566-3813fd96540b',
  'c5a1b894-900e-486d-a2dc-1ff1e6b956fc',
  '0ab3ebd0-505a-4752-b327-006f208e209e',
  'eda4dbac-3fc9-4b83-8e65-d1993dbb0be8',
  'b89d7170-5982-41b5-9a8a-274ddc31b836'
];

const duplicateNodeIds = [
  '264e7203-1399-46fa-a651-750a3ab22499',
  'a69b476e-b355-4e50-bce9-a52cd0ff68ab',
  '7939cb15-4426-4463-a519-031644a7edb3',
  'edf30416-b410-4e34-b3d2-aa265075b2af',
  '1a0fd477-e767-4c80-95f9-eb5794e93acc',
  '93f70b14-2def-47f1-8043-505b59deed95',
  'f3e66c24-3327-43bd-a13a-b887385ff816',
  '9cdc53e0-73bc-437f-b38d-adab5aae3318'
];

const sql = `
SELECT 
  (SELECT count(*) FROM live_sessions WHERE camera_id::text IN ('${duplicateIds.join("','")}')) as live_sessions_count,
  (SELECT count(*) FROM operational_health_latest WHERE device_id IN ('${duplicateIds.join("','")}')) as health_latest_count,
  (SELECT count(*) FROM operational_health_telemetry WHERE device_id IN ('${duplicateIds.join("','")}')) as health_telemetry_count,
  (SELECT count(*) FROM camera_discoveries WHERE device_identity_id IN (SELECT device_identity_id FROM cameras WHERE id::text IN ('${duplicateIds.join("','")}'))) as discoveries_count,
  (SELECT count(*) FROM audit_events WHERE target_id IN ('${duplicateIds.concat(duplicateNodeIds).join("','")}')) as audit_events_count;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
