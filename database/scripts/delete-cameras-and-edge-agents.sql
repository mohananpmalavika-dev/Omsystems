-- ============================================================================
-- Delete Cameras and Edge Agents from Database
-- ============================================================================
--
-- WARNING: This script will delete all cameras, edge agents, and related data.
-- This operation is irreversible. Make a backup before running.
--
-- Usage:
--   psql -d your_database -f delete-cameras-and-edge-agents.sql
--
-- Or for a specific tenant:
--   psql -d your_database -v tenant_id='your-tenant-uuid' -f delete-cameras-and-edge-agents.sql
--
-- ============================================================================

BEGIN;

-- Show what will be deleted
DO $$
DECLARE
  camera_count INTEGER;
  edge_agent_count INTEGER;
  discovery_count INTEGER;
  live_session_count INTEGER;
  incident_camera_count INTEGER;
  tenant_filter TEXT := '';
BEGIN
  -- Build tenant filter if provided
  IF current_setting('my.tenant_id', TRUE) IS NOT NULL THEN
    tenant_filter := format('WHERE tenant_id = %L', current_setting('my.tenant_id', TRUE)::uuid);
  END IF;

  -- Count cameras
  EXECUTE format('SELECT COUNT(*) FROM cameras c JOIN resource_nodes rn ON c.resource_node_id = rn.id %s', 
    CASE WHEN tenant_filter != '' THEN REPLACE(tenant_filter, 'tenant_id', 'rn.tenant_id') ELSE '' END)
    INTO camera_count;

  -- Count edge agents
  EXECUTE format('SELECT COUNT(*) FROM edge_agents %s', tenant_filter)
    INTO edge_agent_count;

  -- Count camera discoveries
  EXECUTE format('SELECT COUNT(*) FROM camera_discoveries %s', tenant_filter)
    INTO discovery_count;

  -- Count live sessions
  EXECUTE format('SELECT COUNT(*) FROM live_sessions ls JOIN cameras c ON ls.camera_id = c.id JOIN resource_nodes rn ON c.resource_node_id = rn.id %s',
    CASE WHEN tenant_filter != '' THEN REPLACE(tenant_filter, 'tenant_id', 'rn.tenant_id') ELSE '' END)
    INTO live_session_count;

  -- Count incident cameras (if table exists)
  BEGIN
    EXECUTE format('SELECT COUNT(*) FROM incident_cameras ic JOIN cameras c ON ic.camera_id = c.id JOIN resource_nodes rn ON c.resource_node_id = rn.id %s',
      CASE WHEN tenant_filter != '' THEN REPLACE(tenant_filter, 'tenant_id', 'rn.tenant_id') ELSE '' END)
      INTO incident_camera_count;
  EXCEPTION
    WHEN undefined_table THEN
      incident_camera_count := 0;
  END;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'DELETION SUMMARY';
  RAISE NOTICE '============================================================';
  IF current_setting('my.tenant_id', TRUE) IS NOT NULL THEN
    RAISE NOTICE 'Tenant ID: %', current_setting('my.tenant_id', TRUE);
  ELSE
    RAISE NOTICE 'Scope: ALL TENANTS';
  END IF;
  RAISE NOTICE '';
  RAISE NOTICE 'Records to be deleted:';
  RAISE NOTICE '  Cameras: %', camera_count;
  RAISE NOTICE '  Edge Agents: %', edge_agent_count;
  RAISE NOTICE '  Camera Discoveries: %', discovery_count;
  RAISE NOTICE '  Live Sessions: %', live_session_count;
  RAISE NOTICE '  Incident Cameras: %', incident_camera_count;
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
END $$;

-- Prompt for confirmation
DO $$
BEGIN
  RAISE NOTICE 'Waiting 3 seconds... Press Ctrl+C to cancel.';
  PERFORM pg_sleep(3);
END $$;

-- ============================================================================
-- DELETION STARTS HERE
-- ============================================================================

-- Set tenant filter as session variable if provided via psql -v
SELECT set_config('my.tenant_id', :'tenant_id', FALSE)
WHERE :'tenant_id' IS NOT NULL AND :'tenant_id' != 'tenant_id';

-- 1. Delete live sessions (depends on cameras)
DELETE FROM live_sessions
WHERE camera_id IN (
  SELECT c.id 
  FROM cameras c
  JOIN resource_nodes rn ON c.resource_node_id = rn.id
  WHERE current_setting('my.tenant_id', TRUE) IS NULL 
     OR rn.tenant_id = current_setting('my.tenant_id', TRUE)::uuid
);

-- 2. Delete incident_cameras (if table exists)
DO $$
BEGIN
  DELETE FROM incident_cameras
  WHERE camera_id IN (
    SELECT c.id 
    FROM cameras c
    JOIN resource_nodes rn ON c.resource_node_id = rn.id
    WHERE current_setting('my.tenant_id', TRUE) IS NULL 
       OR rn.tenant_id = current_setting('my.tenant_id', TRUE)::uuid
  );
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'Table incident_cameras does not exist, skipping.';
END $$;

-- 3. Delete camera discoveries (depends on edge_agents)
DELETE FROM camera_discoveries
WHERE current_setting('my.tenant_id', TRUE) IS NULL 
   OR tenant_id = current_setting('my.tenant_id', TRUE)::uuid;

-- 4. Delete cameras
DELETE FROM cameras
WHERE id IN (
  SELECT c.id 
  FROM cameras c
  JOIN resource_nodes rn ON c.resource_node_id = rn.id
  WHERE current_setting('my.tenant_id', TRUE) IS NULL 
     OR rn.tenant_id = current_setting('my.tenant_id', TRUE)::uuid
);

-- 5. Delete camera resource nodes (type = 'camera')
DELETE FROM resource_nodes
WHERE node_type = 'camera'
  AND (current_setting('my.tenant_id', TRUE) IS NULL 
       OR tenant_id = current_setting('my.tenant_id', TRUE)::uuid);

-- 6. Delete edge agents
DELETE FROM edge_agents
WHERE current_setting('my.tenant_id', TRUE) IS NULL 
   OR tenant_id = current_setting('my.tenant_id', TRUE)::uuid;

-- Show final counts
DO $$
DECLARE
  camera_count INTEGER;
  edge_agent_count INTEGER;
  tenant_filter TEXT := '';
BEGIN
  IF current_setting('my.tenant_id', TRUE) IS NOT NULL THEN
    tenant_filter := format('WHERE tenant_id = %L', current_setting('my.tenant_id', TRUE)::uuid);
  END IF;

  EXECUTE format('SELECT COUNT(*) FROM cameras c JOIN resource_nodes rn ON c.resource_node_id = rn.id %s', 
    CASE WHEN tenant_filter != '' THEN REPLACE(tenant_filter, 'tenant_id', 'rn.tenant_id') ELSE '' END)
    INTO camera_count;

  EXECUTE format('SELECT COUNT(*) FROM edge_agents %s', tenant_filter)
    INTO edge_agent_count;

  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'DELETION COMPLETE';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Remaining records:';
  RAISE NOTICE '  Cameras: %', camera_count;
  RAISE NOTICE '  Edge Agents: %', edge_agent_count;
  RAISE NOTICE '============================================================';
END $$;

COMMIT;

-- ============================================================================
-- Optional: Vacuum to reclaim space
-- ============================================================================
-- Uncomment to run VACUUM (cannot run inside transaction):
-- VACUUM ANALYZE cameras;
-- VACUUM ANALYZE edge_agents;
-- VACUUM ANALYZE camera_discoveries;
-- VACUUM ANALYZE live_sessions;
-- VACUUM ANALYZE resource_nodes;
