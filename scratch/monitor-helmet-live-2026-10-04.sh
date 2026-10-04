set -e
for attempt in $(seq 1 8); do
 sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -At -c "SELECT now(),c.recorder_channel,e.id,e.confidence,e.status,e.rejection_reason,e.occurred_at FROM analytics_events e JOIN cameras c ON c.id=e.camera_id WHERE c.branch_node_id='00000000-0000-4000-8000-000000000104' AND e.detection_type='helmet-worn' AND e.occurred_at>now()-interval '15 minutes' ORDER BY e.occurred_at DESC LIMIT 3;"
 sleep 5
done
