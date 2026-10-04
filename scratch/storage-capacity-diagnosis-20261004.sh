set -e
sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid <<'SQL'
SELECT DISTINCT ON (t.tenant_id,t.branch_id,t.device_id) n.name AS branch,t.device_id,t.source,t.quality,t.idempotency_key,t.observed_at,t.metrics FROM operational_health_telemetry t LEFT JOIN resource_nodes n ON n.id=t.branch_id WHERE t.device_type='disk' ORDER BY t.tenant_id,t.branch_id,t.device_id,t.observed_at DESC;
SELECT external_id,name,capacity_bytes,used_bytes,status,last_seen_at FROM recording_storage_nodes;
SQL
sudo docker inspect sentinel-gcp-dashboard --format '{{.Image}} {{.State.StartedAt}}'
