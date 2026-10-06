import { execSync } from 'child_process';

const sql = `
BEGIN;

-- 1. Disable all face-recognition and face detection rules
UPDATE analytics_rules 
SET enabled = false, 
    updated_at = NOW() 
WHERE (detection_type IN ('face-recognition', 'face', 'face-detection') 
       OR name ILIKE '%face recognition%' 
       OR name ILIKE '%known person%')
  AND enabled = true;

-- 2. Resolve all active Known person recognised alerts
UPDATE analytics_alerts 
SET status = 'resolved',
    resolved_at = NOW(),
    version = version + 1,
    updated_at = NOW()
WHERE title ILIKE '%known person%'
  AND status IN ('new', 'acknowledged', 'investigating', 'escalated');

COMMIT;

-- Verification
SELECT id, title, status, first_detected_at, resolved_at 
FROM analytics_alerts 
WHERE title ILIKE '%known person%'
ORDER BY first_detected_at DESC;

SELECT detection_type, enabled, count(*) 
FROM analytics_rules 
WHERE detection_type IN ('face-recognition', 'face', 'face-detection', 'unknown-person')
GROUP BY detection_type, enabled;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo ${base64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    console.log(`Executing attempt ${attempt}...`);
    const output = execSync(cmd, { encoding: 'utf8', timeout: 30000 });
    console.log('Result:\n', output);
    break;
  } catch (err) {
    console.error(`Attempt ${attempt} failed:`, err.message || err);
    if (attempt === 3) process.exit(1);
    // wait 2 seconds
    execSync('ping 127.0.0.1 -n 3 > nul', { shell: 'cmd.exe' });
  }
}
