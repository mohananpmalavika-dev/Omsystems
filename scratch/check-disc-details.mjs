import { execSync } from 'child_process';

function runSql(sql) {
  const cleanSql = sql.replace(/"/g, '\\"');
  const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c \\"${cleanSql}\\""`;
  return execSync(cmd, { encoding: 'utf8' });
}

console.log('=== DISCOVERY DETAILS FOR 172.29.91.100 ===');
console.log(runSql("SELECT id, display_name, recorder_channel, rtsp_port, status, stream_verified, credentials_required FROM camera_discoveries WHERE ip_address = '172.29.91.100' ORDER BY recorder_channel ASC;"));
