import { execSync } from 'child_process';

const sql = `
SELECT id, name, parent_id, node_type, is_active
FROM resource_nodes
WHERE parent_id = '00000000-0000-4000-8000-000000000104'
  AND name LIKE 'CP PLUS DVR - Channel %'
ORDER BY name;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
