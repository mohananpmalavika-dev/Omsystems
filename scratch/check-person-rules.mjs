import { execSync } from 'child_process';

function runSql(sql) {
  const cleanSql = sql.replace(/"/g, '\\"');
  const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c \\"${cleanSql}\\""`;
  return execSync(cmd, { encoding: 'utf8' });
}

console.log('=== PERSON AND PERSON COUNTING RULES ===');
console.log(runSql("SELECT id, name, detection_type, enabled FROM analytics_rules WHERE detection_type IN ('person', 'person-counting', 'people-counting') OR detection_type ILIKE '%person%' OR name ILIKE '%person%' OR name ILIKE '%counting%';"));

console.log('=== DISTINCT DETECTION TYPES IN ANALYTICS_RULES ===');
console.log(runSql("SELECT DISTINCT detection_type FROM analytics_rules ORDER BY detection_type;"));

console.log('=== RECENT ALERTS MATCHING PERSON / COUNTING ===');
console.log(runSql("SELECT id, title, description, rule_id, status FROM analytics_alerts WHERE (title ILIKE '%person%' OR title ILIKE '%counting%') AND status IN ('new', 'acknowledged') LIMIT 10;"));
