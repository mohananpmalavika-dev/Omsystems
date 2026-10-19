import { execSync } from 'child_process';

const sql = `
SELECT id, name, parent_id, node_type FROM resource_nodes 
WHERE name ILIKE '%kollam%' OR name ILIKE '%wizzmoni%' OR name ILIKE '%om systems%' OR node_type IN ('company', 'organization');

SELECT rn.id, rn.name, rn.parent_id, p.name as parent_name, rn.node_type
FROM resource_nodes rn
LEFT JOIN resource_nodes p ON rn.parent_id = p.id
WHERE rn.node_type = 'branch' OR rn.name IN ('KOLLAM', 'Bettaih', 'Hajipur', 'PERAVARUNI', 'Rajkot');
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
