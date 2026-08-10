-- Migration: Create recording_compliance_checks table
-- Purpose: Store detailed evidence from recorder health checks
-- Version: 032
-- Date: 2026-08-11

-- ============================================================================
-- recording_compliance_checks
-- Stores detailed results from evidence-based recording compliance checks
-- ============================================================================

CREATE TABLE IF NOT EXISTS recording_compliance_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Recorder and channel identification
  recorder_id UUID NOT NULL,
  channel_id TEXT,
  
  -- Check metadata
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Overall aggregated status
  overall_status TEXT NOT NULL CHECK (overall_status IN ('healthy', 'unhealthy', 'unknown')),
  
  -- Individual check results
  -- Each check has status and message
  
  -- Reachability check
  reachable_status TEXT NOT NULL CHECK (reachable_status IN ('healthy', 'unhealthy', 'unknown')),
  reachable_message TEXT,
  reachable_latency_ms INTEGER,
  
  -- Authentication check
  authentication_status TEXT NOT NULL CHECK (authentication_status IN ('healthy', 'unhealthy', 'unknown')),
  authentication_message TEXT,
  authentication_method TEXT,
  
  -- Channel check
  channel_status TEXT NOT NULL CHECK (channel_status IN ('healthy', 'unhealthy', 'unknown')),
  channel_message TEXT,
  
  -- Stream check
  stream_status TEXT NOT NULL CHECK (stream_status IN ('healthy', 'unhealthy', 'unknown')),
  stream_message TEXT,
  stream_state TEXT,
  
  -- Recording check
  recording_status TEXT NOT NULL CHECK (recording_status IN ('healthy', 'unhealthy', 'unknown')),
  recording_message TEXT,
  recording_state TEXT,
  
  -- Archive check (critical - actual evidence of recording)
  archive_status TEXT NOT NULL CHECK (archive_status IN ('healthy', 'unhealthy', 'unknown')),
  archive_message TEXT,
  last_recording_time TIMESTAMPTZ, -- ACTUAL timestamp from archive, never fabricated
  archive_lag_seconds INTEGER, -- Calculated lag from archive evidence
  oldest_recording_time TIMESTAMPTZ,
  retention_days INTEGER,
  retention_compliant BOOLEAN,
  required_retention_days INTEGER,
  
  -- Storage check
  storage_status TEXT NOT NULL CHECK (storage_status IN ('healthy', 'unhealthy', 'unknown')),
  storage_message TEXT,
  storage_total_bytes BIGINT,
  storage_used_bytes BIGINT,
  storage_free_bytes BIGINT,
  storage_usage_percent NUMERIC(5,2),
  
  -- Clock check
  clock_status TEXT NOT NULL CHECK (clock_status IN ('healthy', 'unhealthy', 'unknown')),
  clock_message TEXT,
  clock_drift_seconds INTEGER,
  recorder_time TIMESTAMPTZ,
  platform_time TIMESTAMPTZ,
  
  -- Adapter metadata
  adapter_type TEXT,
  adapter_version TEXT,
  
  -- Historical tracking
  last_verified_healthy_at TIMESTAMPTZ, -- Last time this recorder was verified healthy
  result_age_seconds INTEGER DEFAULT 0,
  
  -- Errors encountered
  errors_json JSONB, -- Array of RecorderCheckError objects
  
  -- Indexes for efficient querying
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_compliance_checks_recorder_id ON recording_compliance_checks(recorder_id);
CREATE INDEX idx_compliance_checks_channel_id ON recording_compliance_checks(channel_id) WHERE channel_id IS NOT NULL;
CREATE INDEX idx_compliance_checks_checked_at ON recording_compliance_checks(checked_at DESC);
CREATE INDEX idx_compliance_checks_overall_status ON recording_compliance_checks(overall_status);
CREATE INDEX idx_compliance_checks_recorder_checked ON recording_compliance_checks(recorder_id, checked_at DESC);

-- Composite index for finding last healthy state
CREATE INDEX idx_compliance_checks_healthy_lookup ON recording_compliance_checks(
  recorder_id, 
  channel_id, 
  checked_at DESC
) WHERE overall_status = 'healthy';

-- Index for time-series queries
CREATE INDEX idx_compliance_checks_timeseries ON recording_compliance_checks(
  recorder_id,
  checked_at DESC
) INCLUDE (overall_status, archive_status, recording_status);

-- Comments for documentation
COMMENT ON TABLE recording_compliance_checks IS 
  'Evidence-based recording compliance check results. Each row represents a comprehensive health check of a recorder/channel with detailed verification evidence.';

COMMENT ON COLUMN recording_compliance_checks.overall_status IS 
  'Aggregated status: unhealthy if any check failed, unknown if any check could not verify, healthy only if all checks passed with positive evidence';

COMMENT ON COLUMN recording_compliance_checks.last_recording_time IS 
  'CRITICAL: Actual timestamp from recorder archive. Never fabricated. NULL means no archive evidence found.';

COMMENT ON COLUMN recording_compliance_checks.archive_lag_seconds IS 
  'Seconds between check time and last recording. Critical metric for continuous recording compliance.';

COMMENT ON COLUMN recording_compliance_checks.last_verified_healthy_at IS 
  'Last time this recorder was verified healthy. Used to track how long a device has been in unknown/unhealthy state.';

COMMENT ON COLUMN recording_compliance_checks.errors_json IS 
  'Array of structured errors encountered during checks. Each error includes code, message, retryable flag, and timestamp.';

-- ============================================================================
-- recorders table
-- Add if not exists
-- ============================================================================

CREATE TABLE IF NOT EXISTS recorders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  vendor TEXT NOT NULL,
  model TEXT,
  ip_address INET NOT NULL,
  port INTEGER NOT NULL DEFAULT 80,
  protocol TEXT DEFAULT 'http' CHECK (protocol IN ('http', 'https')),
  username TEXT,
  password_encrypted TEXT,
  credential_id UUID, -- Reference to device_credentials table
  branch_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(ip_address, port, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_recorders_branch_id ON recorders(branch_id);
CREATE INDEX IF NOT EXISTS idx_recorders_tenant_id ON recorders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recorders_ip_address ON recorders(ip_address);

COMMENT ON TABLE recorders IS 
  'DVR/NVR recorder devices. Each recorder may have multiple channels/cameras.';

-- ============================================================================
-- device_credentials table
-- Add if not exists (for secure credential storage)
-- ============================================================================

CREATE TABLE IF NOT EXISTS device_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_type TEXT NOT NULL CHECK (device_type IN ('camera', 'recorder', 'switch', 'sensor', 'other')),
  username TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  encryption_method TEXT DEFAULT 'aes-256-gcm',
  credential_name TEXT,
  tenant_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_rotated_at TIMESTAMPTZ,
  rotation_required BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_device_credentials_tenant_id ON device_credentials(tenant_id);
CREATE INDEX IF NOT EXISTS idx_device_credentials_device_type ON device_credentials(device_type);

COMMENT ON TABLE device_credentials IS 
  'Secure storage for device credentials with encryption. Referenced by cameras, recorders, and other devices.';

-- ============================================================================
-- Helper view: Latest compliance status per recorder
-- ============================================================================

CREATE OR REPLACE VIEW recorder_latest_compliance_status AS
SELECT DISTINCT ON (recorder_id, channel_id)
  recorder_id,
  channel_id,
  checked_at,
  overall_status,
  reachable_status,
  authentication_status,
  recording_status,
  archive_status,
  last_recording_time,
  archive_lag_seconds,
  storage_status,
  storage_usage_percent,
  last_verified_healthy_at,
  adapter_type
FROM recording_compliance_checks
ORDER BY recorder_id, channel_id, checked_at DESC;

COMMENT ON VIEW recorder_latest_compliance_status IS 
  'Latest compliance status for each recorder/channel combination. Use this for dashboard displays.';

-- ============================================================================
-- Helper view: Stale compliance checks
-- Identifies recorders that have not been checked recently
-- ============================================================================

CREATE OR REPLACE VIEW stale_compliance_checks AS
SELECT 
  r.id as recorder_id,
  r.name as recorder_name,
  r.ip_address,
  c.checked_at as last_checked_at,
  EXTRACT(EPOCH FROM (NOW() - c.checked_at)) / 60 as minutes_since_check,
  c.overall_status as last_status
FROM recorders r
LEFT JOIN LATERAL (
  SELECT checked_at, overall_status
  FROM recording_compliance_checks
  WHERE recorder_id = r.id
  ORDER BY checked_at DESC
  LIMIT 1
) c ON true
WHERE r.enabled = true
  AND (c.checked_at IS NULL OR c.checked_at < NOW() - INTERVAL '15 minutes');

COMMENT ON VIEW stale_compliance_checks IS 
  'Recorders with no recent compliance checks (>15 minutes old or never checked). These need immediate verification.';

-- ============================================================================
-- Helper function: Get recorder compliance summary
-- ============================================================================

CREATE OR REPLACE FUNCTION get_recorder_compliance_summary(
  p_recorder_id UUID,
  p_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  total_checks BIGINT,
  healthy_checks BIGINT,
  unhealthy_checks BIGINT,
  unknown_checks BIGINT,
  healthy_percentage NUMERIC,
  last_checked_at TIMESTAMPTZ,
  last_status TEXT,
  last_verified_healthy_at TIMESTAMPTZ,
  current_archive_lag_seconds INTEGER,
  average_archive_lag_seconds NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_checks,
    COUNT(*) FILTER (WHERE overall_status = 'healthy')::BIGINT as healthy_checks,
    COUNT(*) FILTER (WHERE overall_status = 'unhealthy')::BIGINT as unhealthy_checks,
    COUNT(*) FILTER (WHERE overall_status = 'unknown')::BIGINT as unknown_checks,
    ROUND(
      (COUNT(*) FILTER (WHERE overall_status = 'healthy')::NUMERIC / 
       NULLIF(COUNT(*)::NUMERIC, 0)) * 100, 
      2
    ) as healthy_percentage,
    MAX(checked_at) as last_checked_at,
    (SELECT overall_status FROM recording_compliance_checks 
     WHERE recorder_id = p_recorder_id 
     ORDER BY checked_at DESC LIMIT 1) as last_status,
    (SELECT max(checked_at) FROM recording_compliance_checks 
     WHERE recorder_id = p_recorder_id AND overall_status = 'healthy') as last_verified_healthy_at,
    (SELECT archive_lag_seconds FROM recording_compliance_checks 
     WHERE recorder_id = p_recorder_id 
     ORDER BY checked_at DESC LIMIT 1) as current_archive_lag_seconds,
    ROUND(AVG(archive_lag_seconds)::NUMERIC, 0) as average_archive_lag_seconds
  FROM recording_compliance_checks
  WHERE recorder_id = p_recorder_id
    AND checked_at >= NOW() - (p_hours || ' hours')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_recorder_compliance_summary IS 
  'Get compliance summary for a recorder over specified time period. Returns health statistics, last check info, and archive lag metrics.';
