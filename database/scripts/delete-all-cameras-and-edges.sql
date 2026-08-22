-- ============================================================================
-- Delete All Cameras and Branch Gateways (Edge Agents)
-- ============================================================================
--
-- ⚠️  WARNING: This is a DESTRUCTIVE operation!
--
-- This script deletes:
--   1. ALL cameras
--   2. ALL edge agents (branch gateways)
--
-- The following data will be affected:
--
-- CAMERAS - CASCADE DELETES (automatically deleted):
--   - live_sessions
--   - incident_cameras
--   - camera_permissions
--   - camera_access_requests
--   - camera_purpose_assignments
--   - recording_jobs
--   - evidence_videos
--   - video_analytics_events
--   - maintenance_tickets (related to cameras)
--   - compliance_audit_logs (related to cameras)
--   - camera_discoveries (approved discoveries)
--
-- CAMERAS - RESOURCE NODES:
--   - resource_nodes (camera nodes will be deleted)
--
-- EDGE AGENTS - CASCADE DELETES (automatically deleted):
--   - edge_commands
--   - operational_health (health records for edge agents)
--   - edge_activation_tokens
--   - edge_scan_jobs
--   - camera_discoveries (unapproved discoveries)
--
-- EDGE AGENTS - SET NULL (edge_agent_id will be set to NULL):
--   - device_identities.edge_agent_id
--   - device_ip_observations.edge_agent_id
--   - camera_discovery_credentials.edge_agent_id
--
-- Usage:
--   psql -h localhost -U postgres -d sentinel_grid -f database/scripts/delete-all-cameras-and-edges.sql
--
-- ============================================================================

-- Begin transaction for safety
BEGIN;

-- Display current state before deletion
DO $$
DECLARE
  camera_count INTEGER;
  edge_agent_count INTEGER;
  live_sessions_count INTEGER;
  recording_jobs_count INTEGER;
  discoveries_count INTEGER;
  edge_commands_count INTEGER;
  scan_jobs_count INTEGER;
  camera_resource_nodes_count INTEGER;
BEGIN
  -- Get counts for cameras
  SELECT COUNT(*) INTO camera_count FROM cameras;
  SELECT COUNT(*) INTO live_sessions_count FROM live_sessions;
  SELECT COUNT(*) INTO recording_jobs_count FROM recording_jobs;
  SELECT COUNT(*) INTO camera_resource_nodes_count FROM resource_nodes WHERE node_type = 'camera';
  
  -- Get counts for edge agents
  SELECT COUNT(*) INTO edge_agent_count FROM edge_agents;
  SELECT COUNT(*) INTO discoveries_count FROM camera_discoveries;
  SELECT COUNT(*) INTO edge_commands_count FROM edge_commands;
  SELECT COUNT(*) INTO scan_jobs_count FROM edge_scan_jobs;

  -- Display summary
  RAISE NOTICE '';
  RAISE NOTICE '=================================================================';
  RAISE NOTICE 'DELETION SUMMARY';
  RAISE NOTICE '=================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'CAMERAS:';
  RAISE NOTICE '  - Cameras to delete: %', camera_count;
  RAISE NOTICE '  - Camera resource nodes to delete: %', camera_resource_nodes_count;
  RAISE NOTICE '  - Live Sessions (CASCADE DELETE): %', live_sessions_count;
  RAISE NOTICE '  - Recording Jobs (CASCADE DELETE): %', recording_jobs_count;
  RAISE NOTICE '';
  RAISE NOTICE 'EDGE AGENTS:';
  RAISE NOTICE '  - Edge Agents to delete: %', edge_agent_count;
  RAISE NOTICE '  - Camera Discoveries (CASCADE DELETE): %', discoveries_count;
  RAISE NOTICE '  - Edge Commands (CASCADE DELETE): %', edge_commands_count;
  RAISE NOTICE '  - Edge Scan Jobs (CASCADE DELETE): %', scan_jobs_count;
  RAISE NOTICE '=================================================================';
  RAISE NOTICE '';

  IF camera_count = 0 AND edge_agent_count = 0 THEN
    RAISE NOTICE 'No cameras or edge agents found. Nothing to delete.';
  END IF;
END $$;

-- Display cameras by branch
RAISE NOTICE '';
RAISE NOTICE 'Cameras by Branch:';
RAISE NOTICE '-------------------';
SELECT 
  rn_branch.name as branch_name,
  COUNT(c.id) as camera_count,
  COUNT(DISTINCT c.edge_agent_id) as edge_agent_count
FROM cameras c
LEFT JOIN resource_nodes rn_camera ON c.resource_node_id = rn_camera.id
LEFT JOIN resource_nodes rn_branch ON c.branch_node_id = rn_branch.id
GROUP BY rn_branch.name
ORDER BY camera_count DESC;

-- Display edge agents by branch
RAISE NOTICE '';
RAISE NOTICE 'Edge Agents by Branch:';
RAISE NOTICE '----------------------';
SELECT 
  rn.name as branch_name,
  COUNT(ea.id) as agent_count,
  ea.status,
  MAX(ea.last_seen_at) as last_seen
FROM edge_agents ea
LEFT JOIN resource_nodes rn ON ea.branch_node_id = rn.id
GROUP BY ea.branch_node_id, rn.name, ea.status
ORDER BY agent_count DESC;

-- ============================================================================
-- DELETION EXECUTION
-- ============================================================================
-- UNCOMMENT THE FOLLOWING LINES TO EXECUTE THE DELETION
-- ============================================================================

-- Step 1: Delete all cameras (this will cascade to related data)
-- RAISE NOTICE 'Deleting all cameras...';
-- DELETE FROM cameras;

-- Step 2: Delete camera resource nodes (nodes with type 'camera')
-- RAISE NOTICE 'Deleting camera resource nodes...';
-- DELETE FROM resource_nodes WHERE node_type = 'camera';

-- Step 3: Delete all edge agents (this will cascade to edge-related data)
-- RAISE NOTICE 'Deleting all edge agents...';
-- DELETE FROM edge_agents;

-- RAISE NOTICE '';
-- RAISE NOTICE '=================================================================';
-- RAISE NOTICE 'DELETION COMPLETED SUCCESSFULLY';
-- RAISE NOTICE '=================================================================';

-- ============================================================================
-- For safety, rollback by default
-- ============================================================================
ROLLBACK;

-- ============================================================================
-- TO EXECUTE THE DELETION:
-- 1. Uncomment the DELETE statements above (Step 1, 2, and 3)
-- 2. Replace ROLLBACK; with COMMIT; below
-- ============================================================================

-- COMMIT;

