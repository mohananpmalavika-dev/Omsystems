import { execSync } from 'node:child_process';

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`,
    { encoding: 'utf8' }
  );
}

console.log("=== CHECKING LOG TABLES ===");
console.log(runSql(`
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name LIKE '%log%';
`));

console.log("=== CHECKING RECENT EDGE AGENT LOGS ===");
console.log(runSql(`
SELECT level, message, context, created_at 
FROM edge_agent_logs 
WHERE edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87' 
ORDER BY created_at DESC 
LIMIT 15;
`));

