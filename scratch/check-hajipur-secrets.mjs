import { execSync } from 'node:child_process';

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`,
    { encoding: 'utf8' }
  );
}

console.log('=== SECRETS FOR HAJIPUR ===');
console.log(runSql(`
SELECT id, edge_agent_id, secret_name, secret_type, created_at, updated_at
FROM edge_agent_secrets
WHERE secret_name ILIKE '%hajipur%' OR edge_agent_id IN ('748eeb31-76f8-43e9-9121-4c1d99166e87', '9f108498-4dd5-4a21-b810-eec9e538953c', '839d2a88-2b36-4e34-bd99-6cb247e196a5')
ORDER BY secret_name;
`));

console.log('=== HAJIPUR DVR CREDENTIALS ===');
console.log(runSql(`
SELECT * FROM camera_credentials WHERE branch_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' OR ip_address = '172.29.91.100';
`));

console.log('=== CHECK DISCOVERIES FOR HAJIPUR ===');
console.log(runSql(`
SELECT id, edge_agent_id, branch_node_id, display_name, ip_address, recorder_channel, stream_verified, status, created_at
FROM camera_discoveries
WHERE ip_address = '172.29.91.100' OR branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc'
ORDER BY recorder_channel ASC, created_at DESC;
`));
