sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x -c "
SELECT id, ip_address, recorder_channel, connection_secret_ref, edge_agent_id FROM cameras WHERE ip_address = '192.168.29.171' LIMIT 3;
"
