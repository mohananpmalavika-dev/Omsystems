sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x -c "
SELECT device_type, device_id, source, metrics, reason_codes FROM operational_health_telemetry WHERE edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c' ORDER BY observed_at DESC LIMIT 5;
"
