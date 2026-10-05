import { execSync } from 'child_process';

const sql = `
SELECT * FROM branches WHERE id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' OR name ILIKE '%bett%';
SELECT * FROM camera_credentials WHERE branch_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' OR ip_address = '172.28.18.100';
SELECT * FROM central_stream_secrets WHERE reference ILIKE '%172.28.18.100%' OR reference ILIKE '%dvr-ch%' OR reference ILIKE '%bettaih%' OR reference ILIKE '%bettiah%';
SELECT * FROM cameras WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9';
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
