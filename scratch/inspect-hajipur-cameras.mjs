import { execSync } from 'node:child_process';

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`,
    { encoding: 'utf8' }
  );
}

console.log('=== HAJIPUR CAMERAS ===');
console.log(runSql(`
SELECT c.id, c.model, c.channel, c.recorder_channel, c.edge_agent_id, c.status, c.connection_secret_ref, c.connection_transport, c.ip_address, c.source_type, c.recorder_id, rn.name as rn_name, rn.is_active
FROM cameras c
LEFT JOIN resource_nodes rn ON rn.id = c.resource_node_id
WHERE c.branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' OR c.ip_address = '172.29.91.100'
ORDER BY c.recorder_channel ASC NULLS LAST;
`));

console.log('=== CAMERA DISCOVERIES FOR 172.29.91.100 ===');
console.log(runSql(`
SELECT id, edge_agent_id, branch_node_id, display_name, ip_address, recorder_channel, stream_verified, status, connection_secret_ref, created_at
FROM camera_discoveries
WHERE ip_address = '172.29.91.100'
ORDER BY recorder_channel ASC, created_at DESC;
`));

console.log('=== CREDENTIALS FOR 172.29.91.100 ===');
console.log(runSql(`
SELECT * FROM camera_credentials WHERE ip_address = '172.29.91.100';
`));

console.log('=== OPERATIONAL HEALTH LATEST FOR HAJIPUR ===');
console.log(runSql(`
SELECT ohl.device_id, ohl.edge_agent_id, ohl.observed_at, ohl.metrics->>'status' as status, ohl.metrics->>'streamActive' as stream_active, ohl.metrics->>'videoLoss' as video_loss, ohl.reason_codes
FROM operational_health_latest ohl
WHERE ohl.branch_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc';
`));
