import { execSync } from 'node:child_process';

// Check camera_discoveries schema and records for Peravaruni device identities
const sql = `
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'camera_discoveries' 
ORDER BY ordinal_position;

SELECT * FROM camera_discoveries 
WHERE device_identity_id = '3747dc62-3e32-43fb-9467-1e2175097c2c'
LIMIT 5;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
const result = execSync(cmd, { encoding: 'utf8' });
console.log(result);
