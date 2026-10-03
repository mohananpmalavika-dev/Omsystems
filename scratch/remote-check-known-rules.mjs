import { execSync } from 'child_process';

function runSql(sql) {
  const cleanSql = sql.replace(/"/g, '\\"');
  const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c \\"${cleanSql}\\""`;
  return execSync(cmd, { encoding: 'utf8' });
}

console.log('=== RULES TRIGGERING KNOWN PERSON RECOGNISED ===');
console.log(runSql("SELECT id, name, detection_type, enabled, camera_id FROM analytics_rules WHERE id IN ('2ee7198f-7775-4e96-91b0-86370fddbe64', '8d5b004a-093b-4c21-9bbf-21cde4df3108', 'f603b9ec-ef06-42e3-a679-54435766832a', '15fc3d8b-292f-4c94-a7b9-451dd2a1d5cb');"));

console.log('=== ALL RULES WITH detection_type IN face-recognition, face, etc. ===');
console.log(runSql("SELECT id, name, detection_type, enabled, camera_id FROM analytics_rules WHERE detection_type IN ('face-recognition', 'face', 'face-detection') AND enabled = true;"));
