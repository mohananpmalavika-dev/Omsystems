import { execSync } from 'node:child_process';

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`,
    { encoding: 'utf8' }
  );
}

runSql(`
UPDATE cameras 
SET status = 'offline' 
WHERE id = '3c2101f3-4569-4083-8eef-e27670e26a14';

DELETE FROM operational_health_latest 
WHERE device_id = '3c2101f3-4569-4083-8eef-e27670e26a14';
`);

console.log('=== FINAL HAJIPUR CAMERAS STATUS ===');
console.log(runSql(`
SELECT 
  c.recorder_channel as ch,
  rn.name as channel_name,
  c.status,
  ea.name as edge_agent_name,
  ea.version as agent_version,
  c.connection_secret_ref,
  ohl.metrics->>'status' as health_status,
  ohl.metrics->>'streamActive' as stream_active
FROM cameras c
JOIN resource_nodes rn ON rn.id = c.resource_node_id
JOIN edge_agents ea ON ea.id = c.edge_agent_id
LEFT JOIN operational_health_latest ohl ON ohl.device_id = c.id::text AND ohl.branch_id = c.branch_node_id
WHERE c.branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc'
ORDER BY c.recorder_channel ASC NULLS LAST;
`));
