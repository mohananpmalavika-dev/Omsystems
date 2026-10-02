sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module <<'JS'
const h = await (await fetch('http://localhost:8092/health')).json();
console.log(JSON.stringify({state:h.aiState, frames:h.framesProcessed, detections:h.detectionsSubmitted, pipeline:h.pipeline},null,2));
JS
sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid <<'SQL'
SELECT column_name FROM information_schema.columns WHERE table_name='cameras' AND column_name ~ 'label|name|display';
SELECT recorder_channel,updated_at FROM cameras WHERE id='9b9c11b0-6d5a-40c6-a1c1-a0f31e4438bc';
SQL
