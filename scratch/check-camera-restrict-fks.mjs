import { execSync } from 'child_process';

const sql = `
SELECT 
    conrelid::regclass AS table_name,
    conname AS constraint_name,
    pg_get_constraintdef(c.oid) AS constraint_def
FROM pg_constraint c
WHERE contype = 'f' 
  AND confrelid::regclass::text = 'cameras'
  AND pg_get_constraintdef(c.oid) NOT LIKE '%ON DELETE CASCADE%'
  AND pg_get_constraintdef(c.oid) NOT LIKE '%ON DELETE SET NULL%';
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
