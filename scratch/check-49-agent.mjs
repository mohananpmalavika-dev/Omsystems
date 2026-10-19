import { execSync } from 'node:child_process';

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x"`,
    { encoding: 'utf8' }
  );
}

console.log(runSql("SELECT * FROM edge_agents WHERE id = '748eeb31-76f8-43e9-9121-4c1d99166e87';"));
console.log(runSql("SELECT * FROM edge_agents WHERE id::text LIKE '%49%' OR name ILIKE '%49%';"));
console.log(runSql("SELECT * FROM edge_agent_branch_assignments WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61';"));

