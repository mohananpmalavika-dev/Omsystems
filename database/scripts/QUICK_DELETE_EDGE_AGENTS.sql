-- ============================================================================
-- QUICK DELETE: All Branch Gateways (Edge Agents)
-- ============================================================================
-- 
-- ⚠️ WARNING: This will IMMEDIATELY delete all edge agents!
--
-- BEFORE running this script:
-- 1. BACKUP your database
-- 2. Verify you're connected to the correct database
-- 3. Review the summary below
--
-- CASCADE DELETES: edge_commands, operational_health
-- SET NULL: device_identities, device_ip_observations, camera_discovery_credentials
-- ORPHANED: cameras, edge_scan_jobs, camera_discoveries
--
-- ============================================================================

-- Show current state
SELECT 
  'CURRENT STATE' as info,
  (SELECT COUNT(*) FROM edge_agents) as edge_agents_count,
  (SELECT COUNT(*) FROM edge_commands) as commands_count,
  (SELECT COUNT(*) FROM operational_health WHERE edge_agent_id IN (SELECT id FROM edge_agents)) as health_records_count;

-- Show agents grouped by branch
SELECT 
  rn.name as branch_name,
  COUNT(ea.id) as agent_count
FROM edge_agents ea
LEFT JOIN resource_nodes rn ON ea.branch_node_id = rn.id
GROUP BY rn.name
ORDER BY agent_count DESC;

-- ============================================================================
-- DELETION COMMAND
-- ============================================================================
-- Uncomment the following lines to execute the deletion:

-- BEGIN;
-- DELETE FROM edge_agents;
-- COMMIT;

-- ============================================================================
-- AFTER DELETION - Verify
-- ============================================================================
-- Run this after uncommenting and executing the DELETE command above:

-- SELECT 
--   'AFTER DELETION' as info,
--   (SELECT COUNT(*) FROM edge_agents) as remaining_agents,
--   (SELECT COUNT(*) FROM cameras WHERE edge_agent_id IS NOT NULL) as orphaned_cameras,
--   (SELECT COUNT(*) FROM edge_scan_jobs) as orphaned_scan_jobs;
