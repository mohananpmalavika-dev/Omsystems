import { execSync } from 'child_process';

const sql = `
SELECT rn.id, rn.name, c.id as camera_id, c.channel, c.ip_address, c.last_seen_at
FROM cameras c
LEFT JOIN resource_nodes rn ON c.resource_node_id = rn.id
WHERE rn.name ILIKE '%Pilot%' OR rn.name ILIKE '%Channel 6%' OR rn.name ILIKE '%Channel 2%'
ORDER BY c.last_seen_at DESC NULLS LAST;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
