import { execSync } from 'child_process';

const sql = `
SELECT cd.recorder_channel, cd.id as discovery_id, s.reference
FROM camera_discoveries cd
LEFT JOIN central_stream_secrets s ON s.reference LIKE '%' || cd.id::text
WHERE cd.ip_address = '192.168.29.170'
ORDER BY cd.recorder_channel;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
