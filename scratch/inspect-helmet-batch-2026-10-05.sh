set -e
sudo docker exec -i sentinel-gcp-postgres psql -v ON_ERROR_STOP=1 -U sentinel_admin -d sentinel_grid <<'SQL'
SELECT column_name FROM information_schema.columns WHERE table_name IN ('analytics_events','analytics_detected_objects') ORDER BY table_name,ordinal_position;
SELECT e.id,e.camera_id,n.name,e.occurred_at,e.confidence,e.model_version,a.id AS alert_id,a.status,
 (SELECT array_agg(k) FROM jsonb_object_keys(e.metadata) k) AS metadata_keys
FROM analytics_events e LEFT JOIN cameras c ON c.id=e.camera_id LEFT JOIN resource_nodes n ON n.id=c.resource_node_id LEFT JOIN analytics_alerts a ON a.event_id=e.id
WHERE e.occurred_at BETWEEN '2026-10-05 06:15:00+00' AND '2026-10-05 11:15:00+00' AND e.detection_type='helmet-worn'
ORDER BY e.occurred_at;
SQL
