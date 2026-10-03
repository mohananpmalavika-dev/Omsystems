import { execSync } from 'child_process';
import fs from 'fs';

const sql = fs.readFileSync('scratch/setup-hajipur.sql', 'utf8');
const base64 = Buffer.from(sql).toString('base64');

console.log('Sending and executing SQL on remote GCP postgres...');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
const out = execSync(cmd, { encoding: 'utf8' });
console.log(out);

console.log('=== VERIFYING CAMERAS ===');
const verifySql = `SELECT c.id, rn.name as node_name, c.model, c.channel, c.recorder_channel, c.status, c.connection_secret_ref FROM cameras c JOIN resource_nodes rn ON rn.id = c.resource_node_id WHERE c.ip_address = '172.29.91.100' ORDER BY c.recorder_channel ASC NULLS LAST;`;
const verifyCmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c \\"${verifySql}\\""`;
console.log(execSync(verifyCmd, { encoding: 'utf8' }));
