sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x -c "SELECT * FROM edge_scan_discoveries WHERE id = 'a73f62ff-7b02-4dd8-9ec9-4940f8dbca5a';"
