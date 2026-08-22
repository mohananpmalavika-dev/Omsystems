-- Delete all cameras and gateways from the database
-- Run this script carefully - it will delete ALL cameras and gateways

BEGIN;

-- Delete dependent records first (to avoid foreign key constraints)

-- 1. Delete analytics alerts related to cameras
DELETE FROM analytics_alerts 
WHERE camera_id IN (SELECT id FROM resource_nodes WHERE node_type = 'camera');

-- 2. Delete incident cameras
DELETE FROM incident_cameras 
WHERE camera_id IN (SELECT id FROM resource_nodes WHERE node_type = 'camera');

-- 3. Delete recording segments
DELETE FROM recording_segments 
WHERE camera_id IN (SELECT id FROM resource_nodes WHERE node_type = 'camera');

-- 4. Delete camera health snapshots
DELETE FROM camera_health_snapshots 
WHERE camera_id IN (SELECT id FROM resource_nodes WHERE node_type = 'camera');

-- 5. Delete schedule camera associations
DELETE FROM schedule_cameras 
WHERE camera_id IN (SELECT id FROM resource_nodes WHERE node_type = 'camera');

-- 6. Delete any other camera-related records (add more if needed)
-- DELETE FROM other_table WHERE camera_id IN (SELECT id FROM resource_nodes WHERE node_type = 'camera');

-- Now delete the cameras from resource_nodes
DELETE FROM resource_nodes WHERE node_type = 'camera';

-- Delete gateways (and their dependent records)
-- Note: Deleting gateways might cascade delete cameras if they have ON DELETE CASCADE

DELETE FROM resource_nodes WHERE node_type = 'gateway';

COMMIT;

-- To see how many records would be deleted, run this BEFORE the delete script:
-- SELECT COUNT(*) as camera_count FROM resource_nodes WHERE node_type = 'camera';
-- SELECT COUNT(*) as gateway_count FROM resource_nodes WHERE node_type = 'gateway';
