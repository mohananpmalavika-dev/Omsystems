import { execSync } from 'child_process';

const sql = `SELECT c.id, rn.name as node_name, c.model, c.channel, c.recorder_channel, c.status, c.connection_secret_ref, c.branch_node_id FROM cameras c LEFT JOIN resource_nodes rn ON rn.id = c.resource_node_id WHERE c.ip_address = '172.29.91.100' OR rn.path::text ILIKE '%hajipur%' ORDER BY c.recorder_channel ASC NULLS LAST;`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
