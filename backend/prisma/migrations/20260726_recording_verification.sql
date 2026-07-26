-- Recording Verification Migration
-- Continuous verification that cameras are recording correctly

-- Camera Recording Status Summary (current state)
CREATE TABLE IF NOT EXISTS camera_recording_status (
  camera_id UUID PRIMARY KEY REFERENCES cameras(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL CHECK (status IN ('recording', 'idle', 'error', 'disabled', 'gap_detected', 'playback_failed')),
  is_recording BOOLEAN NOT NULL DEFAULT false,
  last_verified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  health_score INTEGER NOT NULL DEFAULT 100 CHECK (health_score >= 0 AND health_score <= 100),
  last_segment_time TIMESTAMP WITH TIME ZONE,
  segment_completeness NUMERIC(5,2) DEFAULT 0 CHECK (segment_completeness >= 0 AND segment_completeness <= 100),
  issues JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_camera_recording_status_health ON camera_recording_status(health_score);
CREATE INDEX idx_camera_recording_status_verified ON camera_recording_status(last_verified_at DESC);
CREATE INDEX idx_camera_recording_status_recording ON camera_recording_status(is_recording);
CREATE INDEX idx_camera_recording_status_status ON camera_recording_status(status);

COMMENT ON TABLE camera_recording_status IS 'Current recording status summary for each camera';
COMMENT ON COLUMN camera_recording_status.health_score IS 'Recording health score 0-100 based on continuity, gaps, and playback';
COMMENT ON COLUMN camera_recording_status.segment_completeness IS 'Percentage of expected segments present in last 24 hours';
COMMENT ON COLUMN camera_recording_status.issues IS 'Array of current recording issues (gaps, playback failures, etc.)';

-- Recording Verification Log (historical)
CREATE TABLE IF NOT EXISTS recording_verification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  status VARCHAR(50) NOT NULL,
  is_recording BOOLEAN NOT NULL,
  expected_recording BOOLEAN NOT NULL,
  last_segment_time TIMESTAMP WITH TIME ZONE,
  recording_gap_seconds INTEGER DEFAULT 0,
  segment_count_24h INTEGER DEFAULT 0,
  expected_segment_count_24h INTEGER DEFAULT 0,
  segment_completeness NUMERIC(5,2) DEFAULT 0,
  playback_verified BOOLEAN DEFAULT true,
  consecutive_failures INTEGER DEFAULT 0,
  health_score INTEGER NOT NULL DEFAULT 100,
  issues JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_recording_verification_log_camera ON recording_verification_log(camera_id);
CREATE INDEX idx_recording_verification_log_timestamp ON recording_verification_log(timestamp DESC);
CREATE INDEX idx_recording_verification_log_status ON recording_verification_log(status);
CREATE INDEX idx_recording_verification_log_health ON recording_verification_log(health_score);

-- Partition by month for performance
CREATE INDEX idx_recording_verification_log_camera_timestamp ON recording_verification_log(camera_id, timestamp DESC);

COMMENT ON TABLE recording_verification_log IS 'Historical log of recording verification checks';
COMMENT ON COLUMN recording_verification_log.expected_recording IS 'Whether camera should be recording based on schedule and status';
COMMENT ON COLUMN recording_verification_log.recording_gap_seconds IS 'Seconds of recording gaps detected';
COMMENT ON COLUMN recording_verification_log.consecutive_failures IS 'Number of consecutive failed verifications';

-- Recording Gap Detection (detected gaps with details)
CREATE TABLE IF NOT EXISTS recording_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  gap_start TIMESTAMP WITH TIME ZONE NOT NULL,
  gap_end TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_seconds INTEGER NOT NULL,
  expected_segments INTEGER NOT NULL,
  actual_segments INTEGER DEFAULT 0,
  reason VARCHAR(255),
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_recording_gaps_camera ON recording_gaps(camera_id);
CREATE INDEX idx_recording_gaps_detected ON recording_gaps(detected_at DESC);
CREATE INDEX idx_recording_gaps_unresolved ON recording_gaps(camera_id, resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX idx_recording_gaps_duration ON recording_gaps(duration_seconds DESC);

COMMENT ON TABLE recording_gaps IS 'Detected recording gaps with duration and expected vs actual segments';
COMMENT ON COLUMN recording_gaps.expected_segments IS 'Number of recording segments expected during gap period';
COMMENT ON COLUMN recording_gaps.actual_segments IS 'Number of actual segments found (should be 0 for true gaps)';

-- Playback Verification Log
CREATE TABLE IF NOT EXISTS playback_verification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  segment_id UUID REFERENCES recording_segments(id) ON DELETE SET NULL,
  verified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  success BOOLEAN NOT NULL,
  error_message TEXT,
  file_path TEXT,
  file_size_bytes BIGINT,
  verification_duration_ms INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_playback_verification_camera ON playback_verification_log(camera_id);
CREATE INDEX idx_playback_verification_verified ON playback_verification_log(verified_at DESC);
CREATE INDEX idx_playback_verification_success ON playback_verification_log(success);
CREATE INDEX idx_playback_verification_segment ON playback_verification_log(segment_id);

COMMENT ON TABLE playback_verification_log IS 'Log of playback integrity verification attempts';
COMMENT ON COLUMN playback_verification_log.verification_duration_ms IS 'Time taken to verify playback in milliseconds';

-- DVR/NVR Cross-Validation Log
CREATE TABLE IF NOT EXISTS dvr_recording_validation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  dvr_id UUID,
  validated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  platform_recording BOOLEAN NOT NULL,
  dvr_recording BOOLEAN NOT NULL,
  status_match BOOLEAN NOT NULL,
  dvr_last_recording_time TIMESTAMP WITH TIME ZONE,
  dvr_disk_status VARCHAR(50),
  dvr_recording_mode VARCHAR(50),
  discrepancy_details TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_dvr_validation_camera ON dvr_recording_validation_log(camera_id);
CREATE INDEX idx_dvr_validation_validated ON dvr_recording_validation_log(validated_at DESC);
CREATE INDEX idx_dvr_validation_mismatch ON dvr_recording_validation_log(status_match) WHERE status_match = false;

COMMENT ON TABLE dvr_recording_validation_log IS 'Cross-validation of platform recording status vs DVR/NVR actual status';
COMMENT ON COLUMN dvr_recording_validation_log.status_match IS 'Whether platform and DVR recording status match';
COMMENT ON COLUMN dvr_recording_validation_log.discrepancy_details IS 'Details when platform and DVR status do not match';

-- Materialized view for recording health dashboard
CREATE MATERIALIZED VIEW IF NOT EXISTS recording_health_summary AS
SELECT 
  b.id as branch_id,
  b.tenant_id,
  COUNT(*) as total_cameras,
  COUNT(*) FILTER (WHERE crs.is_recording = true) as recording_cameras,
  COUNT(*) FILTER (WHERE crs.status = 'gap_detected') as cameras_with_gaps,
  COUNT(*) FILTER (WHERE crs.status = 'playback_failed') as cameras_with_playback_issues,
  COUNT(*) FILTER (WHERE crs.status = 'error') as cameras_with_errors,
  COUNT(*) FILTER (WHERE crs.health_score < 70) as unhealthy_cameras,
  AVG(crs.health_score) as avg_health_score,
  AVG(crs.segment_completeness) as avg_segment_completeness,
  SUM((crs.issues->0->>'gapDurationSeconds')::int) as total_gap_seconds,
  MAX(crs.last_verified_at) as last_verified_at
FROM cameras c
JOIN resource_nodes b ON b.id = c.branch_node_id
LEFT JOIN camera_recording_status crs ON crs.camera_id = c.id
WHERE c.status != 'disabled'
  AND c.recording_enabled = true
GROUP BY b.id, b.tenant_id;

CREATE UNIQUE INDEX idx_recording_health_summary_branch ON recording_health_summary(branch_id);
CREATE INDEX idx_recording_health_summary_tenant ON recording_health_summary(tenant_id);

COMMENT ON MATERIALIZED VIEW recording_health_summary IS 'Aggregated recording health metrics by branch';

-- Function to refresh recording health summary
CREATE OR REPLACE FUNCTION refresh_recording_health_summary()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY recording_health_summary;
END;
$$;

COMMENT ON FUNCTION refresh_recording_health_summary IS 'Refresh the recording health summary materialized view';

-- Trigger to update updated_at on camera_recording_status
CREATE OR REPLACE FUNCTION update_camera_recording_status_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_camera_recording_status_timestamp
BEFORE UPDATE ON camera_recording_status
FOR EACH ROW
EXECUTE FUNCTION update_camera_recording_status_timestamp();

-- Function to automatically resolve old gaps
CREATE OR REPLACE FUNCTION auto_resolve_old_gaps()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  resolved_count INTEGER;
BEGIN
  UPDATE recording_gaps
  SET 
    resolved_at = NOW(),
    resolution_notes = 'Auto-resolved: Gap older than 7 days'
  WHERE resolved_at IS NULL
    AND gap_start < NOW() - INTERVAL '7 days';
  
  GET DIAGNOSTICS resolved_count = ROW_COUNT;
  RETURN resolved_count;
END;
$$;

COMMENT ON FUNCTION auto_resolve_old_gaps IS 'Automatically resolve recording gaps older than 7 days';

-- Function to calculate recording uptime
CREATE OR REPLACE FUNCTION calculate_recording_uptime(
  p_camera_id UUID,
  p_start_time TIMESTAMP WITH TIME ZONE,
  p_end_time TIMESTAMP WITH TIME ZONE
)
RETURNS TABLE (
  total_duration_seconds BIGINT,
  recording_duration_seconds BIGINT,
  gap_duration_seconds BIGINT,
  uptime_percentage NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH time_range AS (
    SELECT 
      p_start_time as start_time,
      p_end_time as end_time,
      EXTRACT(EPOCH FROM (p_end_time - p_start_time)) as total_seconds
  ),
  segment_duration AS (
    SELECT 
      COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at))), 0) as recording_seconds
    FROM recording_segments
    WHERE camera_id = p_camera_id
      AND started_at >= p_start_time
      AND ended_at <= p_end_time
      AND status = 'ready'
  ),
  gap_duration AS (
    SELECT 
      COALESCE(SUM(duration_seconds), 0) as gap_seconds
    FROM recording_gaps
    WHERE camera_id = p_camera_id
      AND gap_start >= p_start_time
      AND gap_end <= p_end_time
  )
  SELECT 
    tr.total_seconds::BIGINT as total_duration_seconds,
    sd.recording_seconds::BIGINT as recording_duration_seconds,
    gd.gap_seconds::BIGINT as gap_duration_seconds,
    CASE 
      WHEN tr.total_seconds > 0 THEN 
        ROUND((sd.recording_seconds / tr.total_seconds) * 100, 2)
      ELSE 0
    END as uptime_percentage
  FROM time_range tr, segment_duration sd, gap_duration gd;
END;
$$;

COMMENT ON FUNCTION calculate_recording_uptime IS 'Calculate recording uptime percentage for a camera over a time period';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_recording_segments_camera_time ON recording_segments(camera_id, ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_recording_segments_status ON recording_segments(status) WHERE status = 'ready';

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON camera_recording_status TO app_user;
-- GRANT SELECT, INSERT ON recording_verification_log TO app_user;
-- GRANT SELECT, INSERT, UPDATE ON recording_gaps TO app_user;
-- GRANT SELECT, INSERT ON playback_verification_log TO app_user;
-- GRANT SELECT, INSERT ON dvr_recording_validation_log TO app_user;
-- GRANT SELECT ON recording_health_summary TO app_user;
