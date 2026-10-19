import { execSync } from 'node:child_process';

const sql = `
SELECT id, ip_address, manufacturer, model, recorder_id, recorder_channel, stream_verified, rtsp_validated, status, status_reason
FROM camera_discoveries 
WHERE edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87' AND (ip_address::text LIKE '172.29.%' OR ip_address::text = '172.28.36.100')
ORDER BY ip_address, recorder_channel;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
