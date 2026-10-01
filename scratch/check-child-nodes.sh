sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x -c "
SELECT * FROM resource_nodes WHERE parent_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc';
"
