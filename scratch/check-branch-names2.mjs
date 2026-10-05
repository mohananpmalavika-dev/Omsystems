import { execSync } from 'child_process';

const sql = `
SELECT id, name FROM resource_nodes 
WHERE id IN (
  'd7b23dee-9814-48c9-8805-48b61b33e3a9',
  '6ddee070-9050-4f55-aaa1-1190654bbc6b',
  'd8467a57-dae8-4012-ba5e-c3254075aa61',
  '921d336d-baa9-4b25-9f9f-f6542bba94cc'
);
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
