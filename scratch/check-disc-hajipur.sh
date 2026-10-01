sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x -c "
SELECT id, ip_address, vendor, model, status, status_reason, credentials_required, stream_verified, duplicate_status, existing_device_association FROM camera_discoveries WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc';
"
