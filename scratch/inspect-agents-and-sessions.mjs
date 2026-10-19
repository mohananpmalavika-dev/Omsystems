import { execSync } from 'node:child_process';

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`,
    { encoding: 'utf8' }
  );
}

console.log("=== EDGE AGENTS ===");
console.log(runSql("SELECT id, name, hostname, status, last_seen_at FROM edge_agents;"));

console.log("=== BETTAIH VS KOLLAM CAMERAS ===");
console.log(runSql(`
SELECT c.id, c.edge_agent_id, c.connection_secret_ref, b.name as branch_name
FROM cameras c
JOIN branches b ON b.id = c.branch_node_id
WHERE b.name IN ('Bettaih', 'Rajkot', 'KOLLAM')
LIMIT 10;
`));

console.log("=== BETTAIH SECRET VALUES ===");
console.log(runSql(`
SELECT reference, edge_agent_id, updated_at
FROM central_stream_secrets
WHERE reference LIKE '%Bettaih%' OR reference LIKE '%574ec320%'
LIMIT 5;
`));
