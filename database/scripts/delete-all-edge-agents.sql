-- ============================================================================
-- Delete All Branch Gateways (Edge Agents)
-- ============================================================================
--
-- WARNING: This is a destructive operation!
--
-- This script deletes all edge agents (branch gateways) from the database.
-- The following data will be affected:
--
-- CASCADE DELETES (automatically deleted):
--   - edge_commands (all commands for these agents)
--   - operational_health (health records for these agents)
--
-- SET NULL (edge_agent_id will be set to NULL):
--   - device_identities.edge_agent_id
--   - device_ip_observations.edge_agent_id
--   - camera_discovery_credentials.edge_agent_id
--
-- ORPHANED DATA (will reference non-existent agents):
--   - cameras.edge_agent_id (may need manual cleanup)
--   - edge_scan_jobs (may need manual cleanup)
--   - camera_discoveries (may need manual cleanup)
--
-- Usage:
--   psql -h localhost -U postgres -d sentinel_grid -f database/scripts/delete-all-edge-agents.sql
-- ============================================================================

-- Begin transaction for safety
BEGIN;

-- Display current state before deletion
DO $$
DECLARE
  total_count INTEGER;
  commands_count INTEGER;
  health_count INTEGER;
  scan_jobs_count INTEGER;
  discoveries_count INTEGER;
BEGIN
  -- Get counts
  SELECT COUNT(*) INTO total_count FROM edge_agents;
  SELECT COUNT(*) INTO commands_count FROM edge_commands 
    WHERE edge_agent_id IN (SELECT id FROM edge_agents);
  SELECT COUNT(*) INTO health_count FROM operational_health 
    WHERE edge_agent_id IN (SELECT id FROM edge_agents);
  SELECT COUNT(*) INTO scan_jobs_count FROM edge_scan_jobs 
    WHERE edge_agent_id IN (SELECT id FROM edge_agents);
  SELECT COUNT(*) INTO discoveries_count FROM camera_discoveries 
    WHERE edge_agent_id IN (SELECT id FROM edge_agents);

  -- Display summary
  RAISE NOTICE '';
  RAISE NOTICE '=================================================================';
  RAISE NOTICE 'DELETION SUMMARY';
  RAISE NOTICE '=================================================================';
  RAISE NOTICE 'Edge Agents to delete: %', total_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Related data that will be affected:';
  RAISE NOTICE '  - Edge Commands (CASCADE DELETE): %', commands_count;
  RAISE NOTICE '  - Operational Health Records (CASCADE DELETE): %', health_count;
  RAISE NOTICE '  - Edge Scan Jobs (orphaned): %', scan_jobs_count;
  RAISE NOTICE '  - Camera Discoveries (orphaned): %', discoveries_count;
  RAISE NOTICE '=================================================================';
  RAISE NOTICE '';

  IF total_count = 0 THEN
    RAISE NOTICE 'No edge agents found. Nothing to delete.';
  END IF;
END $$;

-- Display details by branch
SELECT 
  rn.name as branch_name,
  ea.branch_node_id::text,
  COUNT(ea.id) as agent_count,
  COUNT(DISTINCT c.id) as associated_camera_count
FROM edge_agents ea
LEFT JOIN resource_nodes rn ON ea.branch_node_id = rn.id
LEFT JOIN cameras c ON c.edge_agent_id = ea.id
GROUP BY ea.branch_node_id, rn.name
ORDER BY agent_count DESC;

-- Display agents to be deleted
SELECT 
  ea.id::text as agent_id,
  ea.name as agent_name,
  ea.version,
  ea.status,
  rn.name as branch_name,
  ea.last_seen_at
FROM edge_agents ea
LEFT JOIN resource_nodes rn ON ea.branch_node_id = rn.id
ORDER BY rn.name, ea.name;

-- ============================================================================
-- UNCOMMENT THE FOLLOWING LINE TO EXECUTE THE DELETION
-- ============================================================================
-- DELETE FROM edge_agents;

-- For safety, rollback by default. Comment out ROLLBACK and uncomment DELETE above to proceed.
ROLLBACK;

-- ============================================================================
-- After uncommenting DELETE and commenting ROLLBACK, the script will:
-- 1. DELETE all edge agents
-- 2. CASCADE DELETE edge_commands and operational_health
-- 3. SET NULL on device_identities.edge_agent_id, device_ip_observations.edge_agent_id
-- 4. Leave orphaned references in cameras, edge_scan_jobs, camera_discoveries
-- ============================================================================

-- To execute the deletion, modify the script as follows:
-- 1. Comment out the ROLLBACK line above
-- 2. Uncomment the DELETE FROM edge_agents; line
-- 3. Replace ROLLBACK; with COMMIT;

-- Example:
-- DELETE FROM edge_agents;
-- COMMIT;
