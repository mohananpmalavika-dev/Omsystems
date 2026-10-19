import { execSync } from 'node:child_process';

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`,
    { encoding: 'utf8' }
  );
}

console.log("=== PERAVARUNI CAMERAS ===");
console.log(runSql(`
SELECT c.id, c.channel, c.status, c.edge_agent_id, c.connection_secret_ref, b.name as branch_name
FROM cameras c
JOIN branches b ON b.id = c.branch_node_id
WHERE b.name = 'PERAVARUNI'
ORDER BY c.channel;
`));

console.log("=== HAJIPUR CAMERAS ===");
console.log(runSql(`
SELECT c.id, c.channel, c.status, c.edge_agent_id, c.connection_secret_ref, b.name as branch_name
FROM cameras c
JOIN branches b ON b.id = c.branch_node_id
WHERE b.name = 'Hajipur'
ORDER BY c.channel;
`));

console.log("=== CHECK CENTRAL_STREAM_SECRETS FOR PERAVARUNI ===");
console.log(runSql(`
SELECT reference, edge_agent_id, updated_at
FROM central_stream_secrets
WHERE reference LIKE '%peravaruni%'
LIMIT 10;
`));
