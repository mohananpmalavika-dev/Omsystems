import { execSync } from 'child_process';

const sql = `
SELECT 
    conname AS constraint_name, 
    pg_get_constraintdef(c.oid) AS constraint_def
FROM pg_constraint c
WHERE conrelid = 'device_identities'::regclass;

SELECT id, camera_id, mac_address, status
FROM device_identities
WHERE camera_id IN (
  '9c8c0914-452c-44a3-8ca3-7e07482fbbce',
  'b11c23c5-c0e2-49c4-bcb7-19bcfebbcd66',
  'fb9fbf75-4009-4ef1-9e13-a85d4042f410',
  '6a949b74-113a-4545-9566-3813fd96540b',
  'c5a1b894-900e-486d-a2dc-1ff1e6b956fc',
  '0ab3ebd0-505a-4752-b327-006f208e209e',
  'eda4dbac-3fc9-4b83-8e65-d1993dbb0be8',
  'b89d7170-5982-41b5-9a8a-274ddc31b836'
);
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
