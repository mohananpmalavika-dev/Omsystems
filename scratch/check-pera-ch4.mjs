import { execSync } from 'node:child_process';

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x"`,
    { encoding: 'utf8' }
  );
}

console.log("=== PERAVARUNI CH 4 CAMERA ===");
console.log(runSql(`
  SELECT c.id, c.channel, c.edge_agent_id, c.connection_secret_ref, c.status
  FROM cameras c
  JOIN branches b ON b.id = c.branch_node_id
  WHERE b.name = 'PERAVARUNI' AND c.channel = 4;
`));

console.log("=== CENTRAL STREAM SECRETS FOR CH 4 ===");
console.log(runSql(`
  SELECT reference, edge_agent_id, updated_at
  FROM central_stream_secrets
  WHERE reference LIKE '%peravaruni-ch4%' OR reference LIKE '%6dd10cd4%ch4%';
`));
