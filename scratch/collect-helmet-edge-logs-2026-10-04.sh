set -e
sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO edge_commands (tenant_id,branch_node_id,edge_agent_id,command_type,payload,requested_by)
SELECT tenant_id,branch_node_id,id,'collect-logs','{"reason":"helmet-alert-live-verification"}'::jsonb,'00000000-0000-4000-8000-000000000201'
FROM edge_agents WHERE id='aaeda07f-01ce-4361-afd3-a54e4ca114f3' AND credential_revoked_at IS NULL
AND NOT EXISTS (SELECT 1 FROM edge_commands WHERE edge_agent_id='aaeda07f-01ce-4361-afd3-a54e4ca114f3' AND command_type='collect-logs' AND requested_at>now()-interval '30 minutes')
RETURNING id,status;
SQL
