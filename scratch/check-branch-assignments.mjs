import { execSync } from 'child_process';

const sql = `
SELECT * FROM edge_agent_branch_assignments;
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'edge_commands';
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
