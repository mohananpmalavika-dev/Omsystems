import { execSync } from 'child_process';

const sql = `
SELECT c.id, r.name, c.location_type FROM cameras c JOIN resource_nodes r ON r.id = c.resource_node_id ORDER BY r.name;
`;
const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
