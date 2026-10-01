sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x -c "
SELECT * FROM cameras WHERE id = '4cf0a091-07de-4d0a-94e7-43c9db44be9e';
"

sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x -c "
SELECT * FROM camera_discoveries WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc';
"

sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x -c "
SELECT * FROM device_identities WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc';
"
