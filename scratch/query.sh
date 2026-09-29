sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x -c "SELECT * FROM edge_agents WHERE id = '09181b97-0674-43ee-9d47-4b8c96f71a6b';"
