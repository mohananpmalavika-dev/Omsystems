-- ============================================================================
-- Script to Delete All Cameras
-- ============================================================================
-- This script safely deletes all cameras and related data
-- 
-- WARNING: This will delete ALL cameras and associated data!
-- Use with caution in production environments.
-- 
-- To delete specific cameras only, modify the WHERE clause at the end.
-- ============================================================================

BEGIN;

-- 1. Delete camera-related analytics data
DELETE FROM analytics_alerts 
WHERE camera_id IN (SELECT id FROM cameras);

DELETE FROM analytics_events 
WHERE camera_id IN (SELECT id FROM cameras);

DELETE FROM analytics_rules 
WHERE camera_id IN (SELECT id FROM cameras);

-- 2. Delete camera-related incidents
DELETE FROM incident_cameras 
WHERE camera_id IN (SELECT id FROM cameras);

DELETE FROM incident_video_ranges 
WHERE camera_id IN (SELECT id FROM cameras);

DELETE FROM incident_clips 
WHERE camera_id IN (SELECT id FROM cameras);

DELETE FROM incident_snapshots 
WHERE camera_id IN (SELECT id FROM cameras);

-- 3. Delete live sessions and bookmarks
DELETE FROM live_bookmarks 
WHERE camera_id IN (SELECT id FROM cameras);

DELETE FROM live_sessions 
WHERE camera_id IN (SELECT id FROM cameras);

-- 4. Delete recording-related data
DELETE FROM recording_segments 
WHERE camera_id IN (SELECT id FROM cameras);

DELETE FROM recording_jobs 
WHERE camera_id IN (SELECT id FROM cameras);

DELETE FROM recording_legal_holds 
WHERE camera_id IN (SELECT id FROM cameras);

-- 5. Delete camera health and monitoring data
DELETE FROM camera_health_history 
WHERE camera_id IN (SELECT id FROM cameras);

DELETE FROM camera_quality_metrics 
WHERE camera_id IN (SELECT id FROM cameras);

DELETE FROM camera_quality_alerts 
WHERE camera_id IN (SELECT id FROM cameras);

DELETE FROM camera_downtime_log 
WHERE camera_id IN (SELECT id FROM cameras);

-- 6. Delete camera permissions and access control
DELETE FROM camera_access_group_members 
WHERE camera_id IN (SELECT id FROM cameras);

DELETE FROM camera_specific_grants 
WHERE camera_id IN (SELECT id FROM cameras);

-- 7. Delete camera specifications and compliance
DELETE FROM camera_specifications 
WHERE camera_id IN (SELECT id FROM cameras);

DELETE FROM camera_installation_compliance 
WHERE camera_id IN (SELECT id FROM cameras);

-- 8. Delete camera discovery records
DELETE FROM discovered_cameras 
WHERE id IN (SELECT id FROM cameras);

-- 9. Get the resource node IDs before deleting cameras
CREATE TEMP TABLE camera_nodes AS 
SELECT resource_node_id FROM cameras;

-- 10. Delete the cameras
DELETE FROM cameras;

-- 11. Delete the resource nodes (if they exist and are not referenced elsewhere)
-- This removes the cameras from the hierarchical tree
DELETE FROM resource_nodes 
WHERE id IN (SELECT resource_node_id FROM camera_nodes)
  AND type = 'camera';

-- Clean up temp table
DROP TABLE camera_nodes;

-- 12. Display summary
SELECT 
  'Cameras deleted successfully' as status,
  (SELECT COUNT(*) FROM cameras) as remaining_cameras,
  (SELECT COUNT(*) FROM resource_nodes WHERE type = 'camera') as remaining_camera_nodes;

COMMIT;

-- ============================================================================
-- To delete specific cameras only, replace the DELETE FROM cameras line with:
-- ============================================================================
-- DELETE FROM cameras WHERE id = 'specific-camera-id';
-- OR
-- DELETE FROM cameras WHERE branch_node_id = 'specific-branch-id';
-- OR
-- DELETE FROM cameras WHERE name LIKE '%test%';
-- ============================================================================
