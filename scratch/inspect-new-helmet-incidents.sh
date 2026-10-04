set -e
sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid <<'SQL'
SELECT id,event_id,camera_id,severity,status,title,created_at FROM analytics_alerts WHERE title ILIKE '%helmet%' AND created_at > '2026-10-04 10:40:00+00' ORDER BY created_at DESC LIMIT 15;
SELECT column_name FROM information_schema.columns WHERE table_name='analytics_events' ORDER BY ordinal_position;
SQL
