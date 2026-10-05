import { execSync } from 'child_process';

const sql = `
SELECT id, display_name, recorder_channel, ip_address, status
FROM camera_discoveries
WHERE branch_node_id = '00000000-0000-4000-8000-000000000104'
ORDER BY recorder_channel;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
