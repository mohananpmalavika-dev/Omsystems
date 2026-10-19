import { execSync } from 'node:child_process';

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`,
    { encoding: 'utf8' }
  );
}

console.log("=== ALL BRANCHES ===");
console.log(runSql("SELECT id, name, code, status FROM branches ORDER BY name;"));

console.log("=== KOLLAM BRANCH DETAILS ===");
console.log(runSql("SELECT * FROM branches WHERE id = '525198ad-504d-48af-ac6c-dca057d38ed5' OR name ILIKE '%kollam%';"));
