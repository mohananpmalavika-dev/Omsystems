\echo '=== RESOURCE NODES (BRANCHES) ==='
SELECT id, name FROM resource_nodes WHERE id = 'd7ef586e-0859-4492-862b-7f2faba8eaaa' OR name ILIKE '%north%';

\echo '=== ALL CAMERAS ==='
SELECT 
  c.id, 
  rn.name as camera_name, 
  c.ip_address, 
  c.status, 
  c.edge_agent_id, 
  ea.name as edge_agent_name,
  ea.status as edge_agent_status,
  c.branch_node_id, 
  bn.name as branch_name,
  c.source_type,
  c.recorder_channel
FROM cameras c
LEFT JOIN resource_nodes rn ON c.resource_node_id = rn.id
LEFT JOIN resource_nodes bn ON c.branch_node_id = bn.id
LEFT JOIN edge_agents ea ON c.edge_agent_id = ea.id;

\echo '=== ALL CAMERA DISCOVERIES ==='
SELECT 
  d.id, 
  d.display_name, 
  d.ip_address, 
  d.status, 
  d.stream_verified, 
  d.credentials_required, 
  d.edge_agent_id, 
  ea.name as edge_agent_name,
  d.branch_node_id, 
  bn.name as branch_name,
  d.discovered_at
FROM camera_discoveries d
LEFT JOIN resource_nodes bn ON d.branch_node_id = bn.id
LEFT JOIN edge_agents ea ON d.edge_agent_id = ea.id
ORDER BY d.discovered_at DESC;

\echo '=== CHECK 172.29.55.100 SPECIFICALLY ==='
SELECT * FROM camera_discoveries WHERE ip_address::text LIKE '%172.29.55%';
SELECT * FROM cameras WHERE ip_address::text LIKE '%172.29.55%';
