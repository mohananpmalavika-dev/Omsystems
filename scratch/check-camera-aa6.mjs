import { execSync } from 'child_process';

const sql = `
SELECT c.id, c.model, c.ip_address, c.recorder_channel, c.channel, b.name as branch_name
FROM cameras c
LEFT JOIN branches b ON b.id = c.branch_node_id
WHERE c.id = 'aa6e8afc-07a6-4b05-b962-c4133f79e306';

SELECT c.id, c.model, c.ip_address, c.recorder_channel, c.channel, b.name as branch_name
FROM cameras c
LEFT JOIN branches b ON b.id = c.branch_node_id
WHERE c.ip_address = '192.168.29.171';
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
