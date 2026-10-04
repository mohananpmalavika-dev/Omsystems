set -e
sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid <<'SQL'
SELECT c.recorder_channel,e.id,e.detection_type,e.confidence,e.status,e.rejection_reason,e.occurred_at FROM analytics_events e JOIN cameras c ON c.id=e.camera_id WHERE c.branch_node_id='00000000-0000-4000-8000-000000000104' AND e.detection_type='helmet-worn' AND e.occurred_at > now()-interval '30 minutes' ORDER BY e.occurred_at DESC LIMIT 12;
SELECT c.recorder_channel,a.id,a.event_id,a.alert_type,a.status,a.created_at FROM alerts a JOIN cameras c ON c.id::text=a.camera_id WHERE c.branch_node_id='00000000-0000-4000-8000-000000000104' AND a.alert_type LIKE '%helmet%' AND a.created_at > now()-interval '30 minutes' ORDER BY a.created_at DESC LIMIT 12;
SELECT table_name,column_name FROM information_schema.columns WHERE table_name IN ('alerts','operational_alerts','alert_incidents') AND column_name IN ('id','event_id','detection_event_id','camera_id','status','created_at','metadata','type','alert_type','detection_type') ORDER BY table_name,column_name;
SQL
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module <<'JS'
const h=await(await fetch('http://localhost:8092/health')).json();console.log(JSON.stringify({state:h.aiState,received:h.received,accepted:h.accepted,failed:h.failed,lastAcceptedAt:h.lastAcceptedAt,helmet:h.pipeline?.detectors?.helmet,scheduler:h.pipeline?.scheduler}));
JS
