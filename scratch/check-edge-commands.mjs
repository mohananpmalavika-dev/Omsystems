import { execSync } from 'child_process';

const sql = `
SELECT id, name, branch_node_id, status FROM edge_agents;
SELECT * FROM edge_agent_branch_assignments;
SELECT id, branch_id, type, payload, status, error, result, created_at, updated_at 
FROM edge_commands 
ORDER BY created_at DESC LIMIT 5;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
