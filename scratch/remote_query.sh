#!/usr/bin/env bash
set -e
sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "SELECT device_id, branch_id, status, observed_at, reason_codes FROM operational_health_latest WHERE branch_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc';"
