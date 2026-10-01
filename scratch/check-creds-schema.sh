sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "\d camera_credentials"

sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "SELECT * FROM camera_credentials;"
