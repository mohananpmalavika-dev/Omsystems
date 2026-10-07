import { runRemote } from './remote-exec.mjs';

const cmd = `
echo "=== 1. DOCKER CONTAINERS STATUS ==="
sudo docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "=== 2. ANALYTICS ENGINE DEPLOYED THRESHOLDS ==="
sudo docker exec sentinel-gcp-analytics-engine grep -n "PERSON_CONFIDENCE" /app/dist/analytics-engine/src/detectors/helmet-detector.js | head -n 3
sudo docker exec sentinel-gcp-analytics-engine grep -n "HELMET_WORN_ALERT_CONFIDENCE" /app/dist/analytics-engine/src/detectors/helmet-detector.js | head -n 3

echo ""
echo "=== 3. CONTROL PLANE COOLDOWN LOGIC ==="
sudo docker exec sentinel-gcp-control-plane grep -n "cooldownSeconds = Math.max" /app/dist/src/database/analytics-repository.js

echo ""
echo "=== 4. DATABASE HELMET RULES STATUS ==="
sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "SELECT detection_type, cooldown_seconds, enabled, count(1) FROM analytics_rules WHERE detection_type = 'helmet-worn' GROUP BY detection_type, cooldown_seconds, enabled;"

echo ""
echo "=== 5. RECENT ALERTS (LAST 2 HOURS) ==="
sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "SELECT id, title, severity, camera_id, created_at FROM analytics_alerts WHERE created_at >= NOW() - interval '2 hours' ORDER BY created_at DESC LIMIT 10;"
`;

console.log(runRemote(cmd));
