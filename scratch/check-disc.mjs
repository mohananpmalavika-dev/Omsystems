import { execSync } from 'child_process';

const sql = `
SELECT * FROM camera_discoveries WHERE id = '6e325f8d-fbaa-4a00-89d7-68231e1850ef';
SELECT * FROM central_stream_secrets WHERE reference LIKE '%6e325f8d%';
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
