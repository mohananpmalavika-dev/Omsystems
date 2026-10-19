import { execSync } from 'child_process';

const sql = `
SELECT id, camera_id, branch_node_id, ip_address, mac_address, status
FROM device_identities
WHERE camera_id IN (
  '4d3caa3d-e03d-4689-81a6-a10e6f26329c',
  '9c8c0914-452c-44a3-8ca3-7e07482fbbce',
  'a66bbc0b-1d47-4462-9cf7-94b5b35824df',
  'b11c23c5-c0e2-49c4-bcb7-19bcfebbcd66'
);

SELECT cd.id, cd.device_identity_id, cd.display_name, cd.ip_address, cd.recorder_channel, cd.status
FROM camera_discoveries cd
JOIN device_identities di ON cd.device_identity_id = di.id
WHERE di.camera_id IN (
  '9c8c0914-452c-44a3-8ca3-7e07482fbbce',
  'b11c23c5-c0e2-49c4-bcb7-19bcfebbcd66'
);
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
