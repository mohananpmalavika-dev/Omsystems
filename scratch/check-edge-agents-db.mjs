import { execSync } from 'child_process';

const sql = `
SELECT id, name, status, last_heartbeat_at, version, ip_address
FROM edge_agents;

SELECT c.id, c.model, c.ip_address, c.channel, c.edge_agent_id
FROM cameras c
WHERE c.ip_address::text ILIKE '192.168.%' OR c.model ILIKE '%192.168%';
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
