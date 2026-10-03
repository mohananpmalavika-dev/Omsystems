import { execSync } from 'child_process';

const sql = `
UPDATE resource_nodes SET is_active = false WHERE id = '974be899-c73a-41f0-8e38-aaed44f335fd';
UPDATE cameras SET status = 'offline' WHERE id = 'fa0a7e3d-6f72-4261-a688-d64dd05efc37';
`;
const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
execSync(cmd, { encoding: 'utf8' });

console.log('=== ACTIVE CAMERAS FOR HAJIPUR BRANCH ===');
const query = `
SELECT rn.id as node_id, rn.name as camera_name, c.id as camera_id, c.channel, c.recorder_channel, c.status
FROM resource_nodes rn
JOIN cameras c ON c.resource_node_id = rn.id
WHERE rn.parent_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND rn.is_active = true
ORDER BY c.recorder_channel ASC;
`;
const qCmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c \\"${query.replace(/"/g, '\\"').replace(/\n/g, ' ')}\\""`;
console.log(execSync(qCmd, { encoding: 'utf8' }));
