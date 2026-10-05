import { execSync } from 'child_process';

const sql = `
SELECT id, name, branch_node_id, version, status, last_seen_at FROM edge_agents WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' OR name ILIKE '%bett%';
SELECT id, name, branch_node_id, version, status, last_seen_at FROM edge_agents ORDER BY last_seen_at DESC NULLS LAST LIMIT 10;
SELECT * FROM cameras WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' OR ip_address = '172.28.18.100';
SELECT * FROM device_identities WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' OR current_ip_address = '172.28.18.100';
SELECT * FROM camera_discoveries WHERE ip_address = '172.28.18.100' OR branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9';
SELECT * FROM camera_credentials WHERE branch_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' OR ip_address = '172.28.18.100';
SELECT id, name, node_type, parent_id, path FROM resource_nodes WHERE parent_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' OR id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9';
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
