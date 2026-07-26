-- Camera Monitoring Enhancement Migration
-- Adds comprehensive camera health tracking, quality metrics, and recovery logging

-- =====================================================
-- Camera Health History Table
-- =====================================================
CREATE TABLE IF NOT EXISTS camera_health_history (
  id BIGSERIAL PRIMARY KEY,
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL CHECK (status IN ('online', 'offline', 'warning', 'degraded', 'unknown')),
  
  -- Performance metrics
  response_time_ms INTEGER,
  
  -- Video quality metrics
  current_fps DECIMAL(6, 2),
  current_bitrate INTEGER, -- kbps
  current_resolution JSONB, -- {"width": 1920, "height": 1080}
  packet_loss DECIMAL(5, 2), -- percentage
  latency_ms INTEGER,
  codec VARCHAR(20),
  
  -- Stream health indicators
  stream_active BOOLEAN DEFAULT false,
  video_loss BOOLEAN DEFAULT false,
  image_frozen BOOLEAN DEFAULT false,
  black_screen BOOLEAN DEFAULT false,
  tampering_detected BOOLEAN DEFAULT false,
  
  -- Error tracking
  error_message TEXT,
  error_code VARCHAR(50),
  
  -- Additional metadata
  metadata JSONB,
  
  -- Indexes for efficient querying
  CONSTRAINT camera_health_history_timestamp_check CHECK (timestamp <= NOW() + INTERVAL '1 minute')
);

-- Indexes for camera_health_history
CREATE INDEX idx_camera_health_history_camera_time 
  ON camera_health_history(camera_id, timestamp DESC);

CREATE INDEX idx_camera_health_history_status 
  ON camera_health_history(status, timestamp DESC);

CREATE INDEX idx_camera_health_history_timestamp 
  ON camera_health_history(timestamp DESC);

CREATE INDEX idx_camera_health_history_quality 
  ON camera_health_history(camera_id, timestamp DESC) 
  WHERE current_fps IS NOT NULL;

-- Partial index for issues
CREATE INDEX idx_camera_health_history_issues 
  ON camera_health_history(camera_id, timestamp DESC)
  WHERE video_loss = true OR image_frozen = true OR black_screen = true OR tampering_detected = true;

-- =====================================================
-- Camera Recovery Log Table
-- =====================================================
CREATE TABLE IF NOT EXISTS camera_recovery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Recovery workflow details
  steps JSONB NOT NULL, -- ["retry", "reboot", "reset"]
  initiated_by VARCHAR(100), -- user_id or 'system'
  status VARCHAR(20) NOT NULL CHECK (status IN ('initiated', 'in_progress', 'completed', 'failed', 'cancelled')),
  
  -- Recovery results
  completed_steps JSONB, -- Steps that were completed
  failed_step VARCHAR(50), -- Step that failed
  error_message TEXT,
  
  -- Timing
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  
  -- Recovery outcome
  success BOOLEAN,
  camera_status_after VARCHAR(20), -- Status after recovery attempt
  
  -- Metadata
  metadata JSONB
);

-- Indexes for camera_recovery_log
CREATE INDEX idx_camera_recovery_log_camera 
  ON camera_recovery_log(camera_id, timestamp DESC);

CREATE INDEX idx_camera_recovery_log_status 
  ON camera_recovery_log(status, timestamp DESC);

CREATE INDEX idx_camera_recovery_log_timestamp 
  ON camera_recovery_log(timestamp DESC);

-- =====================================================
-- Camera Quality Alerts Table
-- =====================================================
CREATE TABLE IF NOT EXISTS camera_quality_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  
  alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN (
    'low_fps', 'high_packet_loss', 'high_latency', 'video_loss',
    'frozen_frame', 'black_screen', 'tampering', 'bitrate_low', 'offline'
  )),
  
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  
  -- Alert state
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'dismissed')),
  
  -- Quality metrics at time of alert
  fps_at_alert DECIMAL(6, 2),
  bitrate_at_alert INTEGER,
  packet_loss_at_alert DECIMAL(5, 2),
  latency_at_alert INTEGER,
  
  -- Timing
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  acknowledged_by VARCHAR(100),
  
  -- Additional data
  metadata JSONB,
  
  CONSTRAINT camera_quality_alerts_timing_check 
    CHECK (resolved_at IS NULL OR resolved_at >= detected_at)
);

-- Indexes for camera_quality_alerts
CREATE INDEX idx_camera_quality_alerts_camera 
  ON camera_quality_alerts(camera_id, detected_at DESC);

CREATE INDEX idx_camera_quality_alerts_branch 
  ON camera_quality_alerts(branch_id, status, detected_at DESC);

CREATE INDEX idx_camera_quality_alerts_type 
  ON camera_quality_alerts(alert_type, status, detected_at DESC);

CREATE INDEX idx_camera_quality_alerts_active 
  ON camera_quality_alerts(status, detected_at DESC)
  WHERE status = 'active';

-- =====================================================
-- Materialized View: Camera Status Summary
-- =====================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS camera_status_summary AS
SELECT 
  c.id as camera_id,
  c.branch_node_id as branch_id,
  rn.name as camera_name,
  c.vendor,
  c.model,
  c.status as current_status,
  c.last_seen_at,
  
  -- Latest health data
  latest.timestamp as last_check,
  latest.current_fps,
  latest.current_bitrate,
  latest.packet_loss,
  latest.latency_ms,
  latest.stream_active,
  latest.video_loss,
  latest.image_frozen,
  latest.black_screen,
  
  -- 24-hour statistics
  stats_24h.total_checks as checks_24h,
  stats_24h.online_checks as online_checks_24h,
  stats_24h.uptime_percentage as uptime_24h,
  stats_24h.avg_fps as avg_fps_24h,
  stats_24h.avg_packet_loss as avg_packet_loss_24h,
  
  -- Active alerts count
  alerts.active_alert_count,
  alerts.latest_alert_time,
  
  -- Last recovery attempt
  recovery.last_recovery_time,
  recovery.last_recovery_success
  
FROM cameras c
JOIN resource_nodes rn ON rn.id = c.resource_node_id

-- Latest health check
LEFT JOIN LATERAL (
  SELECT *
  FROM camera_health_history
  WHERE camera_id = c.id
  ORDER BY timestamp DESC
  LIMIT 1
) latest ON true

-- 24-hour statistics
LEFT JOIN LATERAL (
  SELECT 
    COUNT(*) as total_checks,
    COUNT(*) FILTER (WHERE status = 'online') as online_checks,
    CASE 
      WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE status = 'online')::float / COUNT(*)) * 100
      ELSE 0
    END as uptime_percentage,
    AVG(current_fps) as avg_fps,
    AVG(packet_loss) as avg_packet_loss
  FROM camera_health_history
  WHERE camera_id = c.id
    AND timestamp >= NOW() - INTERVAL '24 hours'
) stats_24h ON true

-- Active alerts
LEFT JOIN LATERAL (
  SELECT 
    COUNT(*) as active_alert_count,
    MAX(detected_at) as latest_alert_time
  FROM camera_quality_alerts
  WHERE camera_id = c.id
    AND status = 'active'
) alerts ON true

-- Last recovery
LEFT JOIN LATERAL (
  SELECT 
    MAX(timestamp) as last_recovery_time,
    (SELECT success FROM camera_recovery_log WHERE camera_id = c.id ORDER BY timestamp DESC LIMIT 1) as last_recovery_success
  FROM camera_recovery_log
  WHERE camera_id = c.id
) recovery ON true;

-- Index for materialized view
CREATE UNIQUE INDEX idx_camera_status_summary_camera 
  ON camera_status_summary(camera_id);

CREATE INDEX idx_camera_status_summary_branch 
  ON camera_status_summary(branch_id);

CREATE INDEX idx_camera_status_summary_status 
  ON camera_status_summary(current_status);

-- =====================================================
-- Function: Refresh Camera Status Summary
-- =====================================================
CREATE OR REPLACE FUNCTION refresh_camera_status_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY camera_status_summary;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Function: Calculate Camera Uptime
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_camera_uptime(
  p_camera_id UUID,
  p_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  uptime_percentage DECIMAL(5, 2),
  total_checks BIGINT,
  online_checks BIGINT,
  avg_response_time_ms DECIMAL(10, 2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE status = 'online')::decimal / COUNT(*)) * 100, 2)
      ELSE 0.00
    END as uptime_percentage,
    COUNT(*) as total_checks,
    COUNT(*) FILTER (WHERE status = 'online') as online_checks,
    ROUND(AVG(response_time_ms), 2) as avg_response_time_ms
  FROM camera_health_history
  WHERE camera_id = p_camera_id
    AND timestamp >= NOW() - (p_hours || ' hours')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Function: Get Camera Quality Score
-- =====================================================
CREATE OR REPLACE FUNCTION get_camera_quality_score(
  p_camera_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_fps_score INTEGER;
  v_packet_loss_score INTEGER;
  v_latency_score INTEGER;
  v_overall_score INTEGER;
  v_latest RECORD;
  v_expected RECORD;
BEGIN
  -- Get latest metrics
  SELECT 
    current_fps,
    packet_loss,
    latency_ms,
    stream_active
  INTO v_latest
  FROM camera_health_history
  WHERE camera_id = p_camera_id
  ORDER BY timestamp DESC
  LIMIT 1;
  
  -- Get expected values
  SELECT 
    (profiles->0->>'frameRate')::float as expected_fps
  INTO v_expected
  FROM cameras
  WHERE id = p_camera_id;
  
  -- If no data or stream inactive, return 0
  IF v_latest IS NULL OR NOT v_latest.stream_active THEN
    RETURN 0;
  END IF;
  
  -- Calculate FPS score (0-100)
  IF v_latest.current_fps IS NOT NULL AND v_expected.expected_fps IS NOT NULL THEN
    v_fps_score := LEAST(100, ROUND((v_latest.current_fps / v_expected.expected_fps) * 100));
  ELSE
    v_fps_score := 50; -- Default if no data
  END IF;
  
  -- Calculate packet loss score (0-100)
  IF v_latest.packet_loss IS NOT NULL THEN
    v_packet_loss_score := GREATEST(0, 100 - (v_latest.packet_loss * 10));
  ELSE
    v_packet_loss_score := 100; -- Assume good if no data
  END IF;
  
  -- Calculate latency score (0-100)
  IF v_latest.latency_ms IS NOT NULL THEN
    v_latency_score := CASE 
      WHEN v_latest.latency_ms <= 100 THEN 100
      WHEN v_latest.latency_ms <= 200 THEN 80
      WHEN v_latest.latency_ms <= 500 THEN 60
      ELSE 40
    END;
  ELSE
    v_latency_score := 80; -- Default
  END IF;
  
  -- Calculate overall score (weighted average)
  v_overall_score := ROUND((v_fps_score * 0.4 + v_packet_loss_score * 0.3 + v_latency_score * 0.3));
  
  RETURN v_overall_score;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Trigger: Auto-create quality alerts
-- =====================================================
CREATE OR REPLACE FUNCTION trigger_camera_quality_alert()
RETURNS TRIGGER AS $$
DECLARE
  v_camera RECORD;
  v_expected_fps FLOAT;
BEGIN
  -- Get camera details
  SELECT 
    c.id,
    c.branch_node_id,
    rn.tenant_id,
    (c.profiles->0->>'frameRate')::float as expected_fps
  INTO v_camera
  FROM cameras c
  JOIN resource_nodes rn ON rn.id = c.resource_node_id
  WHERE c.id = NEW.camera_id;
  
  v_expected_fps := v_camera.expected_fps;
  
  -- Check for low FPS
  IF NEW.current_fps IS NOT NULL AND v_expected_fps IS NOT NULL 
     AND NEW.current_fps < v_expected_fps * 0.7 THEN
    INSERT INTO camera_quality_alerts (
      camera_id, tenant_id, branch_id, alert_type, severity,
      title, message, fps_at_alert, detected_at
    ) VALUES (
      NEW.camera_id,
      v_camera.tenant_id,
      v_camera.branch_id,
      'low_fps',
      'medium',
      'Low FPS Detected',
      'Camera FPS dropped below 70% of expected value',
      NEW.current_fps,
      NEW.timestamp
    )
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Check for high packet loss
  IF NEW.packet_loss IS NOT NULL AND NEW.packet_loss > 5 THEN
    INSERT INTO camera_quality_alerts (
      camera_id, tenant_id, branch_id, alert_type, severity,
      title, message, packet_loss_at_alert, detected_at
    ) VALUES (
      NEW.camera_id,
      v_camera.tenant_id,
      v_camera.branch_id,
      'high_packet_loss',
      'high',
      'High Packet Loss Detected',
      'Camera experiencing significant packet loss',
      NEW.packet_loss,
      NEW.timestamp
    )
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Check for video loss
  IF NEW.video_loss = true THEN
    INSERT INTO camera_quality_alerts (
      camera_id, tenant_id, branch_id, alert_type, severity,
      title, message, detected_at
    ) VALUES (
      NEW.camera_id,
      v_camera.tenant_id,
      v_camera.branch_id,
      'video_loss',
      'critical',
      'Video Loss Detected',
      'Camera feed has been lost',
      NEW.timestamp
    )
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_camera_quality_alert
AFTER INSERT ON camera_health_history
FOR EACH ROW
EXECUTE FUNCTION trigger_camera_quality_alert();

-- =====================================================
-- Table Partitioning for camera_health_history
-- (Optional - for large-scale deployments)
-- =====================================================
-- Uncomment below to enable monthly partitioning

-- ALTER TABLE camera_health_history RENAME TO camera_health_history_template;
-- CREATE TABLE camera_health_history (LIKE camera_health_history_template INCLUDING ALL)
--   PARTITION BY RANGE (timestamp);

-- Create initial partition for current month
-- CREATE TABLE camera_health_history_2026_07 
--   PARTITION OF camera_health_history
--   FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

-- =====================================================
-- Data Retention Policy
-- =====================================================
-- Delete health history older than 90 days
CREATE OR REPLACE FUNCTION cleanup_old_camera_health_data()
RETURNS void AS $$
BEGIN
  DELETE FROM camera_health_history
  WHERE timestamp < NOW() - INTERVAL '90 days';
  
  -- Also cleanup resolved alerts older than 30 days
  DELETE FROM camera_quality_alerts
  WHERE status IN ('resolved', 'dismissed')
    AND resolved_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Comments for Documentation
-- =====================================================
COMMENT ON TABLE camera_health_history IS 'Historical camera health and quality metrics for monitoring and analytics';
COMMENT ON TABLE camera_recovery_log IS 'Log of all camera recovery workflow attempts and outcomes';
COMMENT ON TABLE camera_quality_alerts IS 'Active and historical quality alerts for cameras';
COMMENT ON MATERIALIZED VIEW camera_status_summary IS 'Pre-computed summary of camera status and health for fast dashboard queries';
COMMENT ON FUNCTION calculate_camera_uptime IS 'Calculate uptime percentage and statistics for a camera over specified time period';
COMMENT ON FUNCTION get_camera_quality_score IS 'Calculate overall quality score (0-100) based on FPS, packet loss, and latency';

-- =====================================================
-- Grant Permissions
-- =====================================================
-- Grant appropriate permissions to application role
-- GRANT SELECT, INSERT ON camera_health_history TO app_user;
-- GRANT SELECT, INSERT, UPDATE ON camera_recovery_log TO app_user;
-- GRANT ALL ON camera_quality_alerts TO app_user;
-- GRANT SELECT ON camera_status_summary TO app_user;
