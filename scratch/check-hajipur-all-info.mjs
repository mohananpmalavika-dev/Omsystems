import { execSync } from 'node:child_process';

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`,
    { encoding: 'utf8' }
  );
}

console.log('=== EDGE AGENTS ===');
console.log(runSql("SELECT id, name, version, agent_version, desired_agent_version, status, last_seen_at FROM edge_agents;"));

console.log('=== HAJIPUR BRANCH & CAMERAS ===');
console.log(runSql(`
SELECT c.id, c.name, c.channel, c.recorder_channel, c.edge_agent_id, c.status, c.connection_secret_ref, c.ip_address, rn.name as rn_name, rn.is_active
FROM cameras c
LEFT JOIN resource_nodes rn ON rn.id = c.resource_node_id
WHERE rn.path::text ILIKE '%hajipur%' OR c.ip_address = '172.29.91.100' OR c.branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc'
ORDER BY c.recorder_channel ASC NULLS LAST;
`));

console.log('=== HAJIPUR RESOURCE NODES ===');
console.log(runSql(`
SELECT id, name, node_type, parent_id, path, is_active 
FROM resource_nodes 
WHERE path::text ILIKE '%hajipur%' OR name ILIKE '%hajipur%'
ORDER BY path;
`));

console.log('=== EDGE AGENT BRANCH ASSIGNMENTS ===');
console.log(runSql(`
SELECT ea.name as agent_name, eaba.edge_agent_id, eaba.branch_node_id, rn.name as branch_name, eaba.vpn_networks
FROM edge_agent_branch_assignments eaba
JOIN edge_agents ea ON ea.id = eaba.edge_agent_id
LEFT JOIN resource_nodes rn ON rn.id = eaba.branch_node_id;
`));
