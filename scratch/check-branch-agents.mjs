import { execSync } from 'node:child_process';

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -t -A"`,
    { encoding: 'utf8' }
  );
}

console.log("=== BETTAIH CAMERAS ===");
console.log(runSql(`
  SELECT c.channel, c.id, c.edge_agent_id, c.connection_secret_ref, c.status
  FROM cameras c
  JOIN branches b ON b.id = c.branch_node_id
  WHERE b.name = 'Bettaih'
  ORDER BY c.channel;
`));

console.log("=== ALL BRANCHES EDGE AGENTS ===");
console.log(runSql(`
  SELECT b.name as branch, count(c.id) as cam_count, c.edge_agent_id, ea.name as agent_name, ea.status as agent_status
  FROM cameras c
  JOIN branches b ON b.id = c.branch_node_id
  LEFT JOIN edge_agents ea ON ea.id = c.edge_agent_id
  GROUP BY b.name, c.edge_agent_id, ea.name, ea.status
  ORDER BY b.name;
`));
