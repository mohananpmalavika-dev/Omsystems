import { execSync } from 'child_process';

const sql = `
SELECT * FROM central_stream_secrets WHERE reference LIKE '%dvr-ch%' OR reference LIKE '%172.28.18.100%' OR reference LIKE '%9f108498%';
SELECT * FROM camera_credentials WHERE ip_address IN ('172.28.18.100', '172.29.91.100', '172.28.36.100');
SELECT id, name, branch_node_id, vendor, model, channel, recorder_channel, ip_address, connection_secret_ref FROM cameras WHERE branch_node_id IN ('d7b23dee-9814-48c9-8805-48b61b33e3a9', '6ddee070-9050-4f55-aaa1-1190654bbc6b') ORDER BY branch_node_id, channel;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
