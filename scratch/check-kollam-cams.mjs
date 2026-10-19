import { execSync } from 'node:child_process';

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x"`,
    { encoding: 'utf8' }
  );
}

console.log("=== KOLLAM CAMERAS IN DB ===");
console.log(runSql(`
  SELECT c.id, c.channel, b.name as branch, c.edge_agent_id, c.connection_secret_ref, c.status
  FROM cameras c
  JOIN branches b ON b.id = c.branch_node_id
  WHERE b.name ILIKE '%kollam%'
  ORDER BY c.channel;
`));

console.log("=== CENTRAL STREAM SECRETS FOR KOLLAM ===");
console.log(runSql(`
  SELECT reference, edge_agent_id, updated_at
  FROM central_stream_secrets
  WHERE reference LIKE '%kollam%' OR edge_agent_id = '128f918d-3943-4049-af05-36857b66d41b'
  ORDER BY reference;
`));
