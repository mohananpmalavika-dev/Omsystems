import { execSync } from 'child_process';

function runSql(sql) {
  const cleanSql = sql.replace(/"/g, '\\"');
  const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c \\"${cleanSql}\\""`;
  return execSync(cmd, { encoding: 'utf8' });
}

console.log('=== COUNT OF ENABLED PERSON & COUNTING RULES ===');
console.log(runSql("SELECT detection_type, COUNT(*) FROM analytics_rules WHERE detection_type IN ('person', 'person-counting', 'occupancy-counting', 'footfall') AND enabled = true GROUP BY detection_type;"));
