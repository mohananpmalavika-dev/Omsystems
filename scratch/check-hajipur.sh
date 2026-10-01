sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "
SELECT id, ip_address, source_type, recorder_id, recorder_channel, display_name, status FROM camera_discoveries WHERE ip_address::text LIKE '%172.29.91.100%';
"
