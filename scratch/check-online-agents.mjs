import { execSync } from 'node:child_process';

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x"`,
    { encoding: 'utf8' }
  );
}

console.log(runSql("SELECT id, name, hostname, status, last_seen_at, now() - last_seen_at as ago FROM edge_agents WHERE status = 'online' ORDER BY name;"));
