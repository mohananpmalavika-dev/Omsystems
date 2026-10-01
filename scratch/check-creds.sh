sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x -c "
SELECT id, branch_node_id, edge_agent_id, username, created_at FROM camera_credentials;
"

sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x -c "
SELECT id, branch_node_id, camera_id, edge_agent_id, key, created_at FROM stream_secrets;
" 2>&1
