import { execSync } from 'child_process';

const sql = `
SELECT id, command_type, status, payload, created_at, completed_at FROM edge_commands ORDER BY created_at DESC LIMIT 10;
SELECT * FROM live_sessions WHERE camera_id = 'b14a276f-63bd-4072-bb55-6978a6a8e93b' OR live_stream_path ILIKE '%172.28.18.100%' OR live_stream_path ILIKE '%b14a276f%' ORDER BY created_at DESC LIMIT 5;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
