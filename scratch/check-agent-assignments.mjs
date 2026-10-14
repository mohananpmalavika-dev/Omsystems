import { execSync } from 'child_process';

const sql = `
SELECT id, name, version, agent_version, status, branch_node_id, last_seen_at 
FROM edge_agents 
WHERE id IN ('748eeb31-76f8-43e9-9121-4c1d99166e87', '839d2a88-2b36-4e34-bd99-6cb247e196a5', '9f108498-4dd5-4a21-b810-eec9e538953c');

SELECT edge_agent_id, branch_node_id, vpn_networks 
FROM edge_agent_branch_assignments 
WHERE edge_agent_id IN ('748eeb31-76f8-43e9-9121-4c1d99166e87', '839d2a88-2b36-4e34-bd99-6cb247e196a5', '9f108498-4dd5-4a21-b810-eec9e538953c');
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
