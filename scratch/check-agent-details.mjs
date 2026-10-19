import { execSync } from 'node:child_process';

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x"`,
    { encoding: 'utf8' }
  );
}

console.log("=== FULL RECORD FOR AGENT 128f918d ===");
console.log(runSql("SELECT * FROM edge_agents WHERE id = '128f918d-3943-4049-af05-36857b66d41b';"));

console.log("=== FULL RECORD FOR AGENT 748eeb31 ===");
console.log(runSql("SELECT * FROM edge_agents WHERE id = '748eeb31-76f8-43e9-9121-4c1d99166e87';"));

console.log("=== FULL RECORD FOR AGENT 839d2a88 ===");
console.log(runSql("SELECT * FROM edge_agents WHERE id = '839d2a88-2b36-4e34-bd99-6cb247e196a5';"));
