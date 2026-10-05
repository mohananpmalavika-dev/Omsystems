import { execSync } from 'child_process';

const rajkotId = '6ddee070-9050-4f55-aaa1-1190654bbc6b';
const targetIp = '172.28.36.100';

const sql = `
SELECT id, ip_address, display_name, status, recorder_channel, edge_agent_id, branch_node_id, discovered_at FROM camera_discoveries WHERE ip_address = '${targetIp}';
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
