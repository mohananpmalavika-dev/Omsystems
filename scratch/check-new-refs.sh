sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x -c "
SELECT id, ip_address, recorder_channel, connection_secret_ref, edge_agent_id, profiles FROM cameras WHERE id IN ('3d856964-d701-409f-92c9-f7a70584a980', 'af358096-34fd-4bc6-b75b-473f81bb60e6');
"
