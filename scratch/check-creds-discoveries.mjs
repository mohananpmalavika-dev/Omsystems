import { execSync } from 'node:child_process';

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`,
    { encoding: 'utf8' }
  );
}

console.log("=== CAMERA CREDENTIALS ===");
console.log(runSql("SELECT branch_id, edge_agent_id, ip_address, username, password FROM camera_credentials;"));

console.log("=== CAMERA DISCOVERIES FOR 192.168.29.171 OR 192.168.29.58 OR 192.168.1.33 ===");
console.log(runSql("SELECT edge_agent_id, ip_address, port, protocol, auth_status, discovered_at FROM camera_discoveries ORDER BY discovered_at DESC LIMIT 15;"));
