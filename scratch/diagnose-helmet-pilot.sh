sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid <<'SQL'
SELECT id, recorder_channel FROM cameras WHERE branch_node_id='00000000-0000-4000-8000-000000000104' ORDER BY recorder_channel;
SELECT c.id, r.id, r.detection_type,r.enabled,r.min_confidence,r.min_duration_seconds,r.archived_at FROM analytics_rules r JOIN cameras c ON c.id=r.camera_id WHERE c.branch_node_id='00000000-0000-4000-8000-000000000104' AND (c.recorder_channel=6 OR r.detection_type='helmet-worn') ORDER BY c.id,r.detection_type;
SELECT c.id,e.detection_type,e.status,e.rejection_reason,count(*),max(e.occurred_at) FROM analytics_events e JOIN cameras c ON c.id=e.camera_id WHERE c.branch_node_id='00000000-0000-4000-8000-000000000104' AND e.occurred_at > now()-interval '2 hours' GROUP BY 1,2,3,4 ORDER BY 1,2;
SQL
