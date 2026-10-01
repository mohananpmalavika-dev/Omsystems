sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x -c "
SELECT id, branch_node_id, ip_address, recorder_channel, vendor, model, serial_number, recorder_serial_number, edge_agent_id, status FROM cameras WHERE ip_address = '172.29.91.100';
"

sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x -c "
SELECT id, camera_id, ip_address, port, vendor, model, source_type, recorder_channel, rtsp_path, stream_url, status, discovery_payload FROM camera_discoveries WHERE ip_address = '172.29.91.100';
"

sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "
SELECT id, name, branch_node_id, status, last_heartbeat_at, agent_version FROM edge_agents WHERE id = '9f108498-4dd5-4a21-b810-eec9e538953c';
"
