sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x -c "
SELECT id, edge_agent_id, recorded_at, payload FROM operational_health_telemetry WHERE edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c' ORDER BY recorded_at DESC LIMIT 1;
"
