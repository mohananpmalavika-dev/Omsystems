import { execSync } from 'child_process';

const sql = process.argv[2] || `
SELECT id, vendor, model, channel, recorder_channel, source_type, recorder_id, status, profiles, capabilities, connection_secret_ref 
FROM cameras 
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' 
ORDER BY channel ASC;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
