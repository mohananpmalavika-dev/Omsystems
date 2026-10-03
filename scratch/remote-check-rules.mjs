import { execSync } from 'child_process';

function runSql(sql) {
  const cleanSql = sql.replace(/"/g, '\\"');
  const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c \\"${cleanSql}\\""`;
  return execSync(cmd, { encoding: 'utf8' });
}

console.log('=== ANALYTICS RULES (face / known) ===');
console.log(runSql("SELECT id, name, detection_type, enabled, camera_id FROM analytics_rules WHERE detection_type ILIKE '%face%' OR detection_type ILIKE '%person%' OR name ILIKE '%known%';"));

console.log('=== ALL ENABLED ANALYTICS RULES ===');
console.log(runSql("SELECT id, name, detection_type, enabled, camera_id FROM analytics_rules WHERE enabled = true;"));

console.log('=== RECENT ALERTS (title or description with "known") ===');
console.log(runSql("SELECT id, title, description, rule_id, camera_id, status, created_at FROM analytics_alerts WHERE title ILIKE '%known%' ORDER BY created_at DESC LIMIT 5;"));
