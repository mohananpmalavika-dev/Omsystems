sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x -c "
SELECT id, ip_address, recorder_channel, vendor, model, source_type, discovery_method, stream_verified FROM camera_discoveries WHERE ip_address = '192.168.29.171' LIMIT 5;
"
