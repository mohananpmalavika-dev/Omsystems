#!/usr/bin/env bash
set -e
sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid < /tmp/update_cameras.sql
