import { execSync } from 'child_process';

const sql = `
SELECT id, ip_address, model, camera_id, status, branch_id, channel
FROM camera_discoveries
WHERE id = '58b83ac6-6273-4dab-9c75-2848d7775ca2'
   OR id = '53a705b5-3f1a-447a-ab59-3d953517a438';
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
