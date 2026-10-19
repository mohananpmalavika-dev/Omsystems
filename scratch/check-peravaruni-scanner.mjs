import { execSync } from 'node:child_process';

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x"`,
    { encoding: 'utf8' }
  );
}

console.log(runSql("SELECT * FROM edge_agents WHERE id = '6dd10cd4-5625-48f4-8431-23776bbd0795';"));
console.log(runSql("SELECT * FROM edge_agent_branch_assignments WHERE edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795';"));
console.log(runSql("SELECT * FROM camera_discoveries WHERE edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795' ORDER BY last_seen_at DESC LIMIT 10;"));
