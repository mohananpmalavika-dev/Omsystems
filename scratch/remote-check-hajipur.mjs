import { execSync } from 'child_process';

function runSql(sql) {
  const cleanSql = sql.replace(/"/g, '\\"');
  const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c \\"${cleanSql}\\""`;
  return execSync(cmd, { encoding: 'utf8' });
}

console.log('=== CAMERAS AT HAJIPUR (172.29.91.100) ===');
console.log(runSql("SELECT id, ip_address, recorder_channel, vendor, model, status, connection_secret_ref FROM cameras WHERE ip_address = '172.29.91.100' ORDER BY recorder_channel ASC;"));

console.log('=== ALL CAMERAS IN HAJIPUR BRANCH ===');
console.log(runSql("SELECT id, ip_address, recorder_channel, vendor, model, status FROM cameras WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' ORDER BY recorder_channel ASC;"));

console.log('=== CAMERA DISCOVERIES FOR 172.29.91.100 ===');
console.log(runSql("SELECT id, display_name, ip_address, recorder_channel, status, status_reason FROM camera_discoveries WHERE ip_address = '172.29.91.100' ORDER BY recorder_channel ASC;"));

console.log('=== CREDENTIALS FOR 172.29.91.100 ===');
console.log(runSql("SELECT id, branch_id, ip_address, username FROM camera_credentials WHERE ip_address = '172.29.91.100';"));
