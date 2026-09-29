sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x -c "
INSERT INTO edge_commands (tenant_id, branch_node_id, edge_agent_id, command_type, status, payload, requested_by)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'd7ef586e-0859-4492-862b-7f2faba8eaaa',
  '26cbf33d-9fdd-4446-9df0-9cae1680a6f9',
  'restart-media',
  'queued',
  '{}',
  (SELECT id FROM users WHERE role = 'super_admin' LIMIT 1)
) RETURNING id, command_type, status;
"
