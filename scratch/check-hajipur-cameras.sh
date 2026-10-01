sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "
SELECT id, ip_address, recorder_channel, vendor, model, edge_agent_id, status FROM cameras WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' ORDER BY recorder_channel ASC, ip_address ASC;
"

sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "\d camera_discoveries"

sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "\d edge_agents"
