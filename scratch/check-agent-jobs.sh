sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x -c "
SELECT * FROM edge_agents WHERE id = '9f108498-4dd5-4a21-b810-eec9e538953c';
"

sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x -c "
SELECT * FROM edge_scan_jobs WHERE edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c' ORDER BY created_at DESC LIMIT 5;
"
