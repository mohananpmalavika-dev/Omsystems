import { execSync } from 'child_process';

const sql = `
SELECT rn.id, rn.name, rn.node_type, rn.parent_id, p.name as parent_name, rn.path
FROM resource_nodes rn
LEFT JOIN resource_nodes p ON rn.parent_id = p.id
WHERE rn.node_type = 'branch' OR rn.id = '00000000-0000-4000-8000-000000000103';

SELECT b.name as branch_name, count(c.id) as total_cams, count(c.id) FILTER (WHERE rn.is_active = true) as active_cams
FROM cameras c
LEFT JOIN resource_nodes b ON c.branch_node_id = b.id
LEFT JOIN resource_nodes rn ON c.resource_node_id = rn.id
GROUP BY b.name;

SELECT c.id, c.channel, rn.name as camera_name, b.name as branch_name, rn.is_active, c.status
FROM cameras c
LEFT JOIN resource_nodes rn ON c.resource_node_id = rn.id
LEFT JOIN resource_nodes b ON c.branch_node_id = b.id
WHERE b.name NOT IN ('Bettaih', 'KOLLAM') OR b.name IS NULL
ORDER BY b.name, c.channel;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
