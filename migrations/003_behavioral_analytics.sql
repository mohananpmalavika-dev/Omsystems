-- Migration: Behavioral Analytics & Anomaly Detection
-- Created: 2026-09-16
-- Description: Tables for baseline learning, anomaly detection, and predictive alerts

-- ============================================================================
-- 1. BEHAVIOR BASELINES
-- ============================================================================
-- Stores learned baseline behavior patterns for each camera and time window
CREATE TABLE IF NOT EXISTS behavior_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id TEXT NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  location TEXT,
  time_window TEXT NOT NULL, -- e.g., "weekday-morning", "weekend-night"
  avg_detections_per_hour DECIMAL NOT NULL DEFAULT 0,
  avg_occupancy DECIMAL NOT NULL DEFAULT 0,
  common_object_types TEXT[] NOT NULL DEFAULT '{}',
  peak_hours INTEGER[] NOT NULL DEFAULT '{}',
  quiet_hours INTEGER[] NOT NULL DEFAULT '{}',
  typical_duration DECIMAL NOT NULL DEFAULT 0,
  confidence_score DECIMAL NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  learned_from INTEGER NOT NULL DEFAULT 0, -- Number of samples used
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(camera_id, time_window)
);

CREATE INDEX idx_behavior_baselines_camera ON behavior_baselines(camera_id);
CREATE INDEX idx_behavior_baselines_updated ON behavior_baselines(last_updated DESC);
CREATE INDEX idx_behavior_baselines_confidence ON behavior_baselines(confidence_score DESC);

COMMENT ON TABLE behavior_baselines IS 'Learned baseline behavior patterns per camera and time window';
COMMENT ON COLUMN behavior_baselines.time_window IS 'Time categorization: weekday-morning, weekend-night, etc.';
COMMENT ON COLUMN behavior_baselines.confidence_score IS 'Confidence in baseline (0-1) based on sample size';
COMMENT ON COLUMN behavior_baselines.learned_from IS 'Number of historical events used to learn baseline';

-- ============================================================================
-- 2. BEHAVIOR ANOMALIES
-- ============================================================================
-- Stores detected behavioral anomalies and unusual patterns
CREATE TABLE IF NOT EXISTS behavior_anomalies (
  id TEXT PRIMARY KEY,
  camera_id TEXT NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  camera_name TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  anomaly_type TEXT NOT NULL, -- e.g., "unusual_detection_rate", "unexpected_object_type"
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  confidence DECIMAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  description TEXT NOT NULL,
  expected_behavior TEXT NOT NULL,
  actual_behavior TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  metadata JSONB,
  reviewed BOOLEAN NOT NULL DEFAULT false,
  false_positive BOOLEAN NOT NULL DEFAULT false,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_behavior_anomalies_camera ON behavior_anomalies(camera_id, timestamp DESC);
CREATE INDEX idx_behavior_anomalies_timestamp ON behavior_anomalies(timestamp DESC);
CREATE INDEX idx_behavior_anomalies_severity ON behavior_anomalies(severity, reviewed);
CREATE INDEX idx_behavior_anomalies_type ON behavior_anomalies(anomaly_type);
CREATE INDEX idx_behavior_anomalies_unreviewed ON behavior_anomalies(reviewed, timestamp DESC) WHERE reviewed = false;
CREATE INDEX idx_behavior_anomalies_false_positive ON behavior_anomalies(false_positive) WHERE false_positive = true;

COMMENT ON TABLE behavior_anomalies IS 'Detected behavioral anomalies requiring review';
COMMENT ON COLUMN behavior_anomalies.anomaly_type IS 'Type: unusual_detection_rate, unexpected_object_type, activity_during_quiet_hours, potential_loitering';
COMMENT ON COLUMN behavior_anomalies.expected_behavior IS 'Human-readable description of normal behavior';
COMMENT ON COLUMN behavior_anomalies.actual_behavior IS 'Human-readable description of observed behavior';
COMMENT ON COLUMN behavior_anomalies.reviewed IS 'Whether operator has reviewed this anomaly';
COMMENT ON COLUMN behavior_anomalies.false_positive IS 'Marked as false positive by operator';

-- ============================================================================
-- 3. PREDICTIVE ALERTS
-- ============================================================================
-- Stores predictive alerts based on historical patterns
CREATE TABLE IF NOT EXISTS predictive_alerts (
  id TEXT PRIMARY KEY,
  location TEXT NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  prediction_type TEXT NOT NULL, -- e.g., "intrusion", "loitering", "recurring_anomaly"
  probability DECIMAL NOT NULL CHECK (probability >= 0 AND probability <= 1),
  time_window TEXT NOT NULL, -- e.g., "14:00 - 16:00", "next 24 hours"
  reasoning TEXT NOT NULL,
  suggested_actions TEXT[] NOT NULL DEFAULT '{}',
  based_on_patterns TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'triggered', 'dismissed', 'expired')),
  triggered_at TIMESTAMPTZ,
  dismissed_by TEXT,
  dismissed_at TIMESTAMPTZ,
  dismissal_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_predictive_alerts_branch ON predictive_alerts(branch_id, created_at DESC);
CREATE INDEX idx_predictive_alerts_location ON predictive_alerts(location);
CREATE INDEX idx_predictive_alerts_probability ON predictive_alerts(probability DESC);
CREATE INDEX idx_predictive_alerts_status ON predictive_alerts(status, created_at DESC);
CREATE INDEX idx_predictive_alerts_active ON predictive_alerts(status, expires_at) WHERE status = 'active';
CREATE INDEX idx_predictive_alerts_type ON predictive_alerts(prediction_type);

COMMENT ON TABLE predictive_alerts IS 'Predictive alerts based on historical incident patterns';
COMMENT ON COLUMN predictive_alerts.probability IS 'Probability of incident occurrence (0-1)';
COMMENT ON COLUMN predictive_alerts.reasoning IS 'AI-generated explanation of why this prediction was made';
COMMENT ON COLUMN predictive_alerts.based_on_patterns IS 'Historical patterns that led to this prediction';
COMMENT ON COLUMN predictive_alerts.status IS 'Lifecycle: active → triggered/dismissed/expired';

-- ============================================================================
-- 4. HELPER FUNCTIONS
-- ============================================================================

-- Function to auto-expire old predictive alerts
CREATE OR REPLACE FUNCTION expire_old_predictive_alerts()
RETURNS void AS $$
BEGIN
  UPDATE predictive_alerts
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION expire_old_predictive_alerts() IS 'Auto-expire predictive alerts past their time window';

-- Function to get anomaly statistics
CREATE OR REPLACE FUNCTION get_anomaly_statistics(
  p_camera_id TEXT DEFAULT NULL,
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  total_anomalies BIGINT,
  unreviewed_count BIGINT,
  false_positive_count BIGINT,
  by_severity JSONB,
  by_type JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_anomalies,
    COUNT(*) FILTER (WHERE reviewed = false)::BIGINT as unreviewed_count,
    COUNT(*) FILTER (WHERE false_positive = true)::BIGINT as false_positive_count,
    jsonb_object_agg(
      severity,
      cnt
    ) FILTER (WHERE severity IS NOT NULL) as by_severity,
    jsonb_object_agg(
      anomaly_type,
      type_cnt
    ) FILTER (WHERE anomaly_type IS NOT NULL) as by_type
  FROM (
    SELECT
      severity,
      anomaly_type,
      COUNT(*) as cnt,
      COUNT(*) as type_cnt
    FROM behavior_anomalies
    WHERE (p_camera_id IS NULL OR camera_id = p_camera_id)
      AND timestamp >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY severity, anomaly_type
  ) stats;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_anomaly_statistics(TEXT, INTEGER) IS 'Get anomaly statistics for a camera or all cameras';

-- ============================================================================
-- 5. SAMPLE DATA (Optional - for testing)
-- ============================================================================

-- Insert a sample baseline (commented out - uncomment for testing)
/*
INSERT INTO behavior_baselines (
  camera_id,
  location,
  time_window,
  avg_detections_per_hour,
  avg_occupancy,
  common_object_types,
  peak_hours,
  quiet_hours,
  typical_duration,
  confidence_score,
  learned_from
)
SELECT
  id,
  'Main Entrance',
  'weekday-morning',
  25.5,
  5.2,
  ARRAY['person', 'vehicle'],
  ARRAY[8, 9, 10],
  ARRAY[1, 2, 3],
  120.0,
  0.85,
  1500
FROM cameras
WHERE name LIKE '%Entrance%'
LIMIT 1;
*/

-- ============================================================================
-- 6. GRANTS (Adjust based on your user roles)
-- ============================================================================

-- Grant permissions to application user (adjust 'app_user' as needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON behavior_baselines TO app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON behavior_anomalies TO app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON predictive_alerts TO app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Verify tables created
DO $$
DECLARE
  v_table_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('behavior_baselines', 'behavior_anomalies', 'predictive_alerts');
  
  IF v_table_count = 3 THEN
    RAISE NOTICE 'SUCCESS: All 3 behavioral analytics tables created successfully';
  ELSE
    RAISE WARNING 'INCOMPLETE: Only % of 3 tables created', v_table_count;
  END IF;
END $$;
