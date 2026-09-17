-- =====================================================================
-- MIS Reports Performance Optimization Indexes
-- =====================================================================
-- Version: 1.0
-- Created: September 17, 2026
-- Purpose: Optimize query performance for MIS reporting system
-- 
-- This migration creates indexes for:
-- - Executive KPI Dashboard
-- - Financial TCO Report
-- - Branch Benchmarking Report
-- - Compliance Scorecard
-- - MIS Unified Report
-- 
-- Expected Performance Improvement:
-- - Report load time: 10-30s → 2-5s
-- - Database CPU: -60%
-- - Prevents timeout on large datasets (>10K incidents)
-- =====================================================================

BEGIN;

-- =====================================================================
-- INCIDENTS TABLE INDEXES
-- =====================================================================
-- Most queries filter by tenant_id + detected_at DESC
-- Used by ALL MIS reports for incident analysis

-- Primary composite index for incident queries
CREATE INDEX IF NOT EXISTS idx_incidents_tenant_detected 
  ON incidents(tenant_id, detected_at DESC)
  WHERE deleted_at IS NULL;

-- Detection type filtering (threat analysis)
CREATE INDEX IF NOT EXISTS idx_incidents_detection_type 
  ON incidents(tenant_id, detection_type)
  WHERE deleted_at IS NULL;

-- Severity filtering (P0, P1, P2, P3)
CREATE INDEX IF NOT EXISTS idx_incidents_severity 
  ON incidents(tenant_id, severity)
  WHERE deleted_at IS NULL;

-- Branch-level incident queries
CREATE INDEX IF NOT EXISTS idx_incidents_branch 
  ON incidents(tenant_id, branch_id, detected_at DESC)
  WHERE deleted_at IS NULL;

-- Composite index for complex report queries
-- Optimizes queries that filter by date range + type + severity
CREATE INDEX IF NOT EXISTS idx_incidents_report_combo 
  ON incidents(tenant_id, detected_at DESC, detection_type, severity)
  WHERE deleted_at IS NULL;

-- Status filtering (for resolution time analysis)
CREATE INDEX IF NOT EXISTS idx_incidents_status 
  ON incidents(tenant_id, status, detected_at DESC)
  WHERE deleted_at IS NULL;

-- =====================================================================
-- CAMERAS TABLE INDEXES
-- =====================================================================
-- Used for uptime, availability, and coverage calculations

-- Tenant + status queries (online/offline cameras)
CREATE INDEX IF NOT EXISTS idx_cameras_tenant_status 
  ON cameras(tenant_id, status);

-- Branch + status queries (branch-level camera health)
CREATE INDEX IF NOT EXISTS idx_cameras_branch_status 
  ON cameras(tenant_id, branch_id, status);

-- Last seen timestamp (for freshness checks)
CREATE INDEX IF NOT EXISTS idx_cameras_last_seen 
  ON cameras(tenant_id, last_seen_at DESC NULLS LAST);

-- =====================================================================
-- MAINTENANCE RECORDS TABLE INDEXES
-- =====================================================================
-- Used for maintenance cost calculations and SLA compliance

-- Tenant + date queries (maintenance history)
CREATE INDEX IF NOT EXISTS idx_maintenance_tenant_date 
  ON maintenance_records(tenant_id, created_at DESC);

-- Branch-level maintenance queries
CREATE INDEX IF NOT EXISTS idx_maintenance_branch 
  ON maintenance_records(tenant_id, branch_id, created_at DESC);

-- Status filtering (completed, pending, scheduled)
CREATE INDEX IF NOT EXISTS idx_maintenance_status 
  ON maintenance_records(tenant_id, status, created_at DESC);

-- =====================================================================
-- BRANCHES/NODES TABLE INDEXES
-- =====================================================================
-- Used for hierarchical filtering (org → zone → region → area → branch)

-- Tenant queries (if not already indexed)
CREATE INDEX IF NOT EXISTS idx_nodes_tenant 
  ON nodes(tenant_id, type, name);

-- Parent hierarchy queries
CREATE INDEX IF NOT EXISTS idx_nodes_parent 
  ON nodes(tenant_id, parent_node_id, type);

-- =====================================================================
-- ANALYTICS RULES TABLE INDEXES
-- =====================================================================
-- Used for AI capability coverage analysis

-- Camera + enabled status
CREATE INDEX IF NOT EXISTS idx_analytics_rules_camera 
  ON analytics_rules(camera_id, enabled);

-- Detection type analysis
CREATE INDEX IF NOT EXISTS idx_analytics_rules_detection 
  ON analytics_rules(detection_type, enabled);

-- =====================================================================
-- RECORDING JOBS TABLE INDEXES
-- =====================================================================
-- Used for recording coverage and storage analysis

-- Camera + enabled status
CREATE INDEX IF NOT EXISTS idx_recording_jobs_camera 
  ON recording_jobs(camera_id, enabled, status);

-- Storage tier queries
CREATE INDEX IF NOT EXISTS idx_recording_jobs_storage 
  ON recording_jobs(primary_recording_storage, enabled);

-- =====================================================================
-- RECORDING SEGMENTS TABLE INDEXES
-- =====================================================================
-- Used for storage utilization and retention analysis

-- Tenant + date queries (storage timeline)
CREATE INDEX IF NOT EXISTS idx_recording_segments_tenant_date 
  ON recording_segments(tenant_id, started_at DESC);

-- Storage node queries
CREATE INDEX IF NOT EXISTS idx_recording_segments_storage_node 
  ON recording_segments(storage_node_external_id, storage_tier, status);

-- Size aggregation queries
CREATE INDEX IF NOT EXISTS idx_recording_segments_size 
  ON recording_segments(tenant_id, size_bytes, storage_tier);

-- =====================================================================
-- USERS TABLE INDEXES
-- =====================================================================
-- Used for attendance and activity tracking

-- Tenant + status queries
CREATE INDEX IF NOT EXISTS idx_users_tenant_status 
  ON users(tenant_id, status);

-- Last login tracking
CREATE INDEX IF NOT EXISTS idx_users_last_login 
  ON users(tenant_id, last_login_at DESC NULLS LAST);

-- =====================================================================
-- AUDIT LOG TABLE INDEXES
-- =====================================================================
-- Used for compliance audit trail and activity analysis

-- Tenant + timestamp queries
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_timestamp 
  ON audit_log(tenant_id, timestamp DESC);

-- Action filtering (for specific event types)
CREATE INDEX IF NOT EXISTS idx_audit_log_action 
  ON audit_log(tenant_id, action, timestamp DESC);

-- Resource queries (branch-specific audit)
CREATE INDEX IF NOT EXISTS idx_audit_log_resource 
  ON audit_log(tenant_id, resource_node_id, timestamp DESC);

-- =====================================================================
-- ALERTS TABLE INDEXES
-- =====================================================================
-- Used for alert response time and SLA analysis

-- Tenant + created timestamp
CREATE INDEX IF NOT EXISTS idx_alerts_tenant_created 
  ON alerts(tenant_id, created_at DESC);

-- Status + priority queries
CREATE INDEX IF NOT EXISTS idx_alerts_status_priority 
  ON alerts(tenant_id, status, priority, created_at DESC);

-- Resolution time analysis
CREATE INDEX IF NOT EXISTS idx_alerts_resolved 
  ON alerts(tenant_id, resolved_at DESC NULLS LAST);

-- =====================================================================
-- TELEMETRY TABLE INDEXES
-- =====================================================================
-- Used for operational health metrics

-- Branch + device type queries
CREATE INDEX IF NOT EXISTS idx_telemetry_branch_device 
  ON operational_telemetry(tenant_id, branch_id, device_type, observed_at DESC);

-- Latest observation queries
CREATE INDEX IF NOT EXISTS idx_telemetry_latest 
  ON operational_telemetry(tenant_id, observed_at DESC);

-- =====================================================================
-- VERIFY INDEX CREATION
-- =====================================================================

-- Display created indexes
SELECT 
  schemaname AS schema,
  tablename AS table,
  indexname AS index_name,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_indexes 
JOIN pg_class ON pg_indexes.indexname = pg_class.relname
WHERE schemaname = 'public' 
  AND indexname LIKE 'idx_%_tenant%'
  OR indexname LIKE 'idx_%_report%'
ORDER BY tablename, indexname;

COMMIT;

-- =====================================================================
-- MAINTENANCE NOTES
-- =====================================================================
-- 
-- These indexes are designed for read-heavy workloads (MIS reporting).
-- They will slightly slow down INSERT/UPDATE operations but dramatically
-- improve SELECT query performance.
-- 
-- Expected index sizes:
-- - incidents table: ~500MB for 1M rows
-- - cameras table: ~50MB for 50K cameras
-- - maintenance_records: ~100MB for 500K records
-- 
-- Maintenance commands:
-- - Rebuild indexes: REINDEX INDEX CONCURRENTLY idx_name;
-- - Analyze statistics: ANALYZE incidents;
-- - Check index usage: pg_stat_user_indexes
-- 
-- To drop an index (if needed):
-- DROP INDEX CONCURRENTLY idx_name;
-- 
-- =====================================================================
