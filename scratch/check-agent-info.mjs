import { execSync } from 'child_process';

const sql = `
SELECT id, name, version, status, last_seen_at, system_info, last_ip_address, metadata 
FROM edge_agents 
WHERE id = '9f108498-4dd5-4a21-b810-eec9e538953c';
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
