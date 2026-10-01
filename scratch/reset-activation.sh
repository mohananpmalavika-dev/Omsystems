sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "
DELETE FROM edge_agents WHERE id = 'de7731c7-03db-4db7-9925-8cdef8a33af9';
UPDATE edge_activation_tokens SET used_at = NULL, expires_at = now() + interval '24 hours' WHERE id = '0f237fbb-558c-4aab-a59c-88988bcc57d3';
SELECT id, branch_node_id, agent_name, expires_at, used_at FROM edge_activation_tokens WHERE id = '0f237fbb-558c-4aab-a59c-88988bcc57d3';
"
