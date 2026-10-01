sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x -c "
SELECT discovery_layers, profiles FROM camera_discoveries WHERE id = 'c8ca15c7-304c-45e5-8f9e-bcf8a9ee5fa6';
"
