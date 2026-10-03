import { execSync } from 'child_process';

function runSql(sql) {
  const cleanSql = sql.replace(/"/g, '\\"');
  const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c \\"${cleanSql}\\""`;
  return execSync(cmd, { encoding: 'utf8' });
}

console.log('=== ALL FACE RECOGNITION MATCH RULES ===');
console.log(runSql("SELECT id, name, detection_type, enabled, camera_id FROM analytics_rules WHERE detection_type = 'face-recognition';"));

// Let's disable them!
console.log('=== DISABLING ALL FACE-RECOGNITION RULES ===');
console.log(runSql("UPDATE analytics_rules SET enabled = false WHERE detection_type = 'face-recognition';"));

console.log('=== ACKNOWLEDGING / RESOLVING ACTIVE KNOWN PERSON ALERTS ===');
console.log(runSql("UPDATE analytics_alerts SET status = 'resolved' WHERE title ILIKE '%known person%' AND status IN ('new', 'acknowledged');"));
