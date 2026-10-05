import { execSync } from 'child_process';

const sql = `
SELECT c.id, rn.name as node_name, c.vendor, c.model, c.channel, c.recorder_channel, c.recorder_id, c.ip_address, c.connection_secret_ref, c.branch_node_id
FROM cameras c 
JOIN resource_nodes rn ON rn.id = c.resource_node_id
WHERE c.branch_node_id IN (
  'd8467a57-dae8-4012-ba5e-c3254075aa61', -- SIKAR
  '921d336d-baa9-4b25-9f9f-f6542bba94cc', -- Hajipur
  '6ddee070-9050-4f55-aaa1-1190654bbc6b', -- Rajkot
  'd7b23dee-9814-48c9-8805-48b61b33e3a9'  -- Bettaih
)
ORDER BY c.branch_node_id, c.recorder_channel;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
