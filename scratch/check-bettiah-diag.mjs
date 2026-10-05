import { execSync } from 'child_process';

const sql = `
SELECT * FROM branch_connectivity_profiles WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9';
SELECT id, ip_address, status, recorder_channel, stream_verified, error FROM camera_discoveries WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9';
SELECT * FROM edge_agent_branch_assignments WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9';
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
