sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x -c "
SELECT id, ip_address, vendor, model, source_type, recorder_channel, profiles, discovery_layers FROM camera_discoveries WHERE ip_address = '172.29.91.100';
"
