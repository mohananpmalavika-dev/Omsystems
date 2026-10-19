import { execSync } from 'node:child_process';

const sql = `
SELECT id, edge_agent_id, host(ip_address) as ip, manufacturer, model, recorder_id, recorder_channel, stream_verified, rtsp_validated, status, status_reason
FROM camera_discoveries 
WHERE host(ip_address) = '172.29.55.100'
ORDER BY recorder_channel;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
