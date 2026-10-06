#!/usr/bin/env bash
set -e
sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "SELECT id, channel, name, ip_address, connection_secret_ref FROM cameras WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND channel IN (7, 8);"
