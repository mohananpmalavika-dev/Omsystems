import { execSync } from 'node:child_process';

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`,
    { encoding: 'utf8' }
  );
}

console.log('=== ALL RESOURCE NODES UNDER HAJIPUR ===');
console.log(runSql(`
SELECT id, name, node_type, is_active, path
FROM resource_nodes
WHERE path::text ILIKE '%921d336d_baa9_4b25_9f9f_f6542bba94cc%'
ORDER BY name;
`));

console.log('=== ALL CAMERAS UNDER HAJIPUR ===');
console.log(runSql(`
SELECT c.id, c.resource_node_id, rn.name as node_name, c.channel, c.recorder_channel, c.status, c.edge_agent_id, c.connection_secret_ref, c.source_type, c.recorder_id, rn.is_active
FROM cameras c
JOIN resource_nodes rn ON rn.id = c.resource_node_id
WHERE c.branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc'
ORDER BY c.channel ASC NULLS LAST;
`));

console.log('=== ALL DEVICE IDENTITIES UNDER HAJIPUR ===');
console.log(runSql(`
SELECT id, branch_node_id, edge_agent_id, credential_ref, device_type, model, status, last_seen_at
FROM device_identities
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc';
`));
