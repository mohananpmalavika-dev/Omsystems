-- Analytics Statistics Performance Indexes
-- Optimized indexes for time-bucketed aggregation queries over analytics_events

-- Core tenant + time index (most important for statistics queries)
-- This index supports: WHERE tenant_id = ? AND occurred_at >= ? AND occurred_at < ?
CREATE INDEX IF NOT EXISTS analytics_events_tenant_time_idx
ON analytics_events (tenant_id, occurred_at DESC)
WHERE status = 'accepted';

-- Tenant + detector type + time (for type-specific queries)
-- Supports: WHERE tenant_id = ? AND detection_type = ? AND occurred_at >= ?
CREATE INDEX IF NOT EXISTS analytics_events_tenant_detector_time_idx
ON analytics_events (tenant_id, detection_type, occurred_at DESC)
WHERE status = 'accepted';

-- Camera-specific statistics (already exists but we'll ensure it's optimal)
-- analytics_events_camera_time_idx already exists from 012_video_analytics.sql

-- Partial index for alerts (events that generated alerts)
-- Much smaller than full index since most events don't generate alerts
CREATE INDEX IF NOT EXISTS analytics_events_tenant_alert_time_idx
ON analytics_events (tenant_id, occurred_at DESC)
WHERE status = 'accepted' AND primary_rule_id IS NOT NULL;

-- Multi-column index for filtered aggregations
-- Supports complex queries with type, status, and time filtering
CREATE INDEX IF NOT EXISTS analytics_events_tenant_status_type_time_idx
ON analytics_events (tenant_id, status, detection_type, occurred_at DESC);

-- GIN index on metadata for flexible querying (optional - enable if needed)
-- Useful for correlation key lookups and custom metadata filtering
-- CREATE INDEX IF NOT EXISTS analytics_events_metadata_gin_idx
-- ON analytics_events USING gin (metadata);

-- Index for branch-level aggregations (requires join to cameras)
-- Composite index to support branch filtering efficiently
CREATE INDEX IF NOT EXISTS cameras_branch_id_idx
ON cameras (branch_id)
WHERE branch_id IS NOT NULL;

-- Optimize analytics_alerts queries for severity aggregation
CREATE INDEX IF NOT EXISTS analytics_alerts_event_severity_idx
ON analytics_alerts (event_id, severity);

-- Add comments for maintenance
COMMENT ON INDEX analytics_events_tenant_time_idx IS
  'Core index for statistics queries with tenant isolation and time range filtering';

COMMENT ON INDEX analytics_events_tenant_detector_time_idx IS
  'Optimized for per-detector-type statistics aggregation';

COMMENT ON INDEX analytics_events_tenant_alert_time_idx IS
  'Partial index for alert-producing events only (much smaller than full index)';

COMMENT ON INDEX analytics_events_tenant_status_type_time_idx IS
  'Multi-column index for complex filtered aggregations';

-- Analyze tables to update statistics for query planner
ANALYZE analytics_events;
ANALYZE analytics_alerts;
ANALYZE cameras;
