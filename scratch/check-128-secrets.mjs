import { execSync } from 'node:child_process';

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -t -A"`,
    { encoding: 'utf8' }
  );
}

console.log("=== SECRETS FOR 128f918d (KOLLAM) ===");
console.log(runSql("SELECT reference, edge_agent_id FROM central_stream_secrets WHERE edge_agent_id = '128f918d-3943-4049-af05-36857b66d41b' ORDER BY reference;"));
