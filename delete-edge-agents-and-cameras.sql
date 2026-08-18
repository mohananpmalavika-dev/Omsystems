-- =====================================================
-- DELETE ALL EDGE AGENTS AND CAMERAS
-- =====================================================
-- WARNING: This is a DESTRUCTIVE operation!
-- This script will delete:
-- - All edge agents (gateways)
-- - All cameras
-- - Related data (health checks, telemetry, commands, etc.)
--
-- BACKUP YOUR DATABASE BEFORE RUNNING THIS!
-- =====================================================

BEGIN;

-- Display current counts
SELECT 'Current Counts:' AS info;
SELECT 'Edge Agents:' AS type, COUNT(*) AS count FROM edge_agents;
SELECT 'Cameras:' AS type, COUNT(*) AS count FROM cameras;

-- =====================================================
-- STEP 1: Delete Edge Agent Related Data
-- =====================================================

-- Delete edge agent health metrics
DELETE FROM edge_agent_health WHERE TRUE;

-- Delete edge upgrade runs
DELETE FROM edge_upgrade_runs WHERE TRUE;

-- Delete edge deployments (keep releases for future use)
DELETE FROM edge_deployments WHERE TRUE;

-- Delete edge activation tokens
DELETE FROM edge_activation_tokens WHERE TRUE;

-- Delete edge commands
DELETE FROM edge_commands WHERE TRUE;

-- Delete edge scan jobs
DELETE FROM edge_scan_jobs WHERE TRUE;

-- Delete edge managed tunnels
DELETE FROM edge_managed_tunnels WHERE TRUE;

-- =====================================================
-- STEP 2: Delete Camera Related Data
-- =====================================================

-- Delete camera health history
DELETE FROM camera_health_history WHERE TRUE;

-- Delete camera recovery logs
DELETE FROM camera_recovery_log WHERE TRUE;

-- Delete camera quality alerts
DELETE FROM camera_quality_alerts WHERE TRUE;

-- Delete camera health checks
DELETE FROM camera_health_checks WHERE TRUE;

-- Delete camera quality checks
DELETE FROM camera_quality_checks WHERE TRUE;

-- Delete camera recording status
DELETE FROM camera_recording_status WHERE TRUE;

-- Delete camera retention verification
DELETE FROM camera_retention_verification WHERE TRUE;

-- Delete camera specifications
DELETE FROM camera_specifications WHERE TRUE;

-- Delete camera installation compliance
DELETE FROM camera_installation_compliance WHERE TRUE;

-- Delete camera privacy controls
DELETE FROM camera_privacy_controls WHERE TRUE;

-- Delete camera privacy purpose assignments
DELETE FROM camera_privacy_purpose_assignments WHERE TRUE;

-- Delete camera access group members
DELETE FROM camera_access_group_members WHERE TRUE;

-- Delete camera access requests
DELETE FROM camera_access_requests WHERE TRUE;

-- Delete camera specific grants
DELETE FROM camera_specific_grants WHERE TRUE;

-- Delete camera appearances (analytics)
DELETE FROM camera_appearances WHERE TRUE;

-- Delete camera transitions (analytics)
DELETE FROM camera_transitions WHERE TRUE;

-- Delete camera transition rules
DELETE FROM camera_transition_rule WHERE TRUE;

-- Delete analytics acknowledgements for cameras
DELETE FROM analytics_acknowledgements WHERE TRUE;

-- Delete discovered devices (pending camera approvals)
DELETE FROM discovered_devices WHERE TRUE;

-- =====================================================
-- STEP 3: Delete Main Tables
-- =====================================================

-- Delete all cameras (will cascade to some related tables)
DELETE FROM cameras WHERE TRUE;

-- Delete all edge agents (will cascade to some related tables)
DELETE FROM edge_agents WHERE TRUE;

-- =====================================================
-- STEP 4: Verify Deletion
-- =====================================================

SELECT 'After Deletion:' AS info;
SELECT 'Edge Agents:' AS type, COUNT(*) AS count FROM edge_agents;
SELECT 'Cameras:' AS type, COUNT(*) AS count FROM cameras;
SELECT 'Edge Agent Health:' AS type, COUNT(*) AS count FROM edge_agent_health;
SELECT 'Camera Health History:' AS type, COUNT(*) AS count FROM camera_health_history;

-- =====================================================
-- COMMIT or ROLLBACK
-- =====================================================
-- If everything looks good, COMMIT
-- If you want to undo, ROLLBACK

-- Uncomment ONE of these:
-- COMMIT;
ROLLBACK;  -- Default is ROLLBACK for safety
