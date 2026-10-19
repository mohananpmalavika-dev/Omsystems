import { execSync } from 'node:child_process';

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x"`,
    { encoding: 'utf8' }
  );
}

console.log("=== CAMERA DISCOVERIES COLUMNS ===");
console.log(runSql("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'camera_discoveries' ORDER BY ordinal_position;"));

console.log("=== CAMERA DISCOVERIES FOR PERAVARUNI SCANNER ===");
console.log(runSql("SELECT * FROM camera_discoveries WHERE edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795';"));

console.log("=== PERAVARUNI RELATED DISCOVERIES (172.29.% or 192.168.250.%) ===");
console.log(runSql("SELECT id, edge_agent_id, ip_address, manufacturer, model, rtsp_url, channel_number, updated_at FROM camera_discoveries WHERE ip_address LIKE '172.29.%' OR ip_address LIKE '192.168.250.%' LIMIT 20;"));

