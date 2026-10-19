import { execSync } from 'child_process';

const sql = `
SELECT c.id, c.name, b.name as branch_name 
FROM cameras c
JOIN branches b ON b.id = c.branch_node_id
WHERE b.name ILIKE '%bettiah%' OR c.name ILIKE '%bettiah%' OR c.name ILIKE '%ch%6%';
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
