sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "
UPDATE cameras SET edge_agent_id = '0706c694-3c7c-4ac1-885c-fb6e34932b01' WHERE edge_agent_id = '09181b97-0674-43ee-9d47-4b8c96f71a6b';
UPDATE camera_credentials SET edge_agent_id = '0706c694-3c7c-4ac1-885c-fb6e34932b01' WHERE edge_agent_id = '09181b97-0674-43ee-9d47-4b8c96f71a6b';
UPDATE camera_discoveries SET edge_agent_id = '0706c694-3c7c-4ac1-885c-fb6e34932b01' WHERE edge_agent_id = '09181b97-0674-43ee-9d47-4b8c96f71a6b';
UPDATE edge_scan_jobs SET edge_agent_id = '0706c694-3c7c-4ac1-885c-fb6e34932b01' WHERE edge_agent_id = '09181b97-0674-43ee-9d47-4b8c96f71a6b';
DELETE FROM edge_agents WHERE id = '09181b97-0674-43ee-9d47-4b8c96f71a6b';
SELECT count(*) as cameras_migrated FROM cameras WHERE edge_agent_id = '0706c694-3c7c-4ac1-885c-fb6e34932b01';
"
