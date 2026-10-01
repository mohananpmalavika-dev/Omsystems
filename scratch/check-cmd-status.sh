sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x -c "
SELECT id, command_type, status, error, result, requested_at, started_at, completed_at FROM edge_commands WHERE id = '5c9dc972-4001-411d-b0f9-261c89008949';
"

sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "
SELECT id, ip_address, recorder_channel, vendor, model, status, status_reason FROM camera_discoveries WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' ORDER BY recorder_channel ASC;
"
