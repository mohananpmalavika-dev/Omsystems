import { execSync } from 'child_process';

const sql = `
SELECT id, name, branch_node_id, version, status, last_seen_at FROM edge_agents;
SELECT id, name, is_active FROM resource_nodes WHERE id IN ('945083b9-ee6e-4c17-8589-1ade81d10f72', '9f6cc655-6f48-4d5f-91ce-125ba455c466');
SELECT * FROM cameras WHERE resource_node_id IN ('945083b9-ee6e-4c17-8589-1ade81d10f72', '9f6cc655-6f48-4d5f-91ce-125ba455c466');
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
