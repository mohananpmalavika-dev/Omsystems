sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x -c "
SELECT id, email, role, full_name FROM app_users LIMIT 5;
"
