import { execSync } from 'child_process';

const sql = `
SELECT id, model, vendor, ip_address, recorder_channel, channel, installation_notes
FROM cameras
WHERE installation_notes ILIKE '%Pilot%' 
   OR model ILIKE '%Pilot%' 
   OR vendor ILIKE '%Pilot%'
   OR model ILIKE '%CP PLUS%'
ORDER BY id;

SELECT id, name, type FROM branches WHERE name ILIKE '%Pilot%' OR name ILIKE '%Local%';
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
