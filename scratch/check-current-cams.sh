sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "
SELECT id, recorder_channel, model, ip_address, edge_agent_id FROM cameras WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc';
"
