import { execSync } from 'child_process';

function runSql(sql) {
  const cleanSql = sql.replace(/"/g, '\\"');
  const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c \\"${cleanSql}\\""`;
  return execSync(cmd, { encoding: 'utf8' });
}

console.log('=== HELMET AND OBJECT RULES FOR HAJIPUR ===');
console.log(runSql(`
SELECT r.id, r.name, r.detection_type, r.enabled, r.camera_id, c.model 
FROM analytics_rules r
JOIN cameras c ON c.id = r.camera_id
WHERE c.ip_address = '172.29.91.100' AND r.detection_type IN ('helmet-worn', 'object')
ORDER BY c.recorder_channel, r.detection_type;
`));

console.log('=== ALL ENABLED HELMET & OBJECT RULES ACROSS SYSTEM ===');
console.log(runSql(`
SELECT detection_type, count(*) 
FROM analytics_rules 
WHERE detection_type IN ('helmet-worn', 'object') AND enabled = true 
GROUP BY detection_type;
`));
