import { execSync } from 'child_process';

const sql = `
UPDATE analytics_rules 
SET cooldown_seconds = 20, updated_at = NOW() 
WHERE detection_type = 'helmet-worn';

SELECT detection_type, cooldown_seconds, count(1)
FROM analytics_rules
WHERE detection_type = 'helmet-worn'
GROUP BY detection_type, cooldown_seconds;
`;

const remoteBash = `
set -euo pipefail

echo "=== 1. Updating analytics_rules in PostgreSQL ==="
echo '${Buffer.from(sql).toString('base64')}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid

echo "=== 2. Patching analytics-repository.js in sentinel-gcp-control-plane ==="
sudo docker exec sentinel-gcp-control-plane sed -i 's/Math.max(rule.cooldownSeconds || 60, 30)/Math.max(rule.cooldownSeconds || 60, 10)/g' /app/dist/src/database/analytics-repository.js

echo "=== 3. Verifying patched line in container ==="
sudo docker exec sentinel-gcp-control-plane grep -n "cooldownSeconds = Math.max" /app/dist/src/database/analytics-repository.js

echo "=== 4. Restarting sentinel-gcp-control-plane ==="
sudo docker restart sentinel-gcp-control-plane

echo "=== 5. Waiting for control-plane health ==="
for i in $(seq 1 30); do
  if sudo docker exec sentinel-gcp-control-plane node -e '
    fetch("http://localhost:8080/health").then(r => {
      if (r.ok) { process.exit(0); }
      process.exit(1);
    }).catch(() => process.exit(1));
  ' 2>/dev/null; then
    echo "Control plane is healthy!"
    break
  fi
  sleep 2
done
`;

const b64 = Buffer.from(remoteBash).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${b64}' | base64 -d | bash"`;

console.log("Applying cooldown update...");
console.log(execSync(cmd, { encoding: 'utf8' }));
