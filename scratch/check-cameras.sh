sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "SELECT id, name, edge_agent_id FROM cameras WHERE branch_node_id = '00000000-0000-4000-8000-000000000104' LIMIT 15;"
