/**
 * Branch Command Center Database Migration
 * 
 * Creates tables for:
 * - Branch health snapshots (historical tracking)
 * - Branch operational events (timeline)
 * - Operator audit log (compliance)
 */

-- Branch Health Snapshots
-- Periodic snapshots for historical analysis and reporting
CREATE TABLE IF NOT EXISTS branch_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  
  -- Overall health
  health_state VARCHAR(20) NOT NULL CHECK (health_state IN ('HEALTHY', 'WARNING', 'CRITICAL', 'UNKNOWN')),
  health_score INTEGER NOT NULL CHECK (health_score >= 0 AND health_score <= 100),
  
  -- Component states
  internet_state VARCHAR(20),
  recorder_state VARCHAR(20),
  storage_state VARCHAR(20),
  retention_state VARCHAR(20),
  
  -- Camera metrics
  cameras_total INTEGER DEFAULT 0,
  cameras_online INTEGER DEFAULT 0,
  cameras_recording INTEGER DEFAULT 0,
  cameras_offline INTEGER DEFAULT 0,
  
  -- Storage metrics
  storage_total_gb DECIMAL(10, 2),
  storage_used_gb DECIMAL(10, 2),
  storage_usage_pct DECIMAL(5, 2),
  disks_failed INTEGER DEFAULT 0,
  
  -- Retention metrics
  required_retention_days INTEGER,
  minimum_retention_days INTEGER,
  median_retention_days INTEGER,
  retention_violations INTEGER DEFAULT 0,
  
  -- Alert metrics
  critical_alerts INTEGER DEFAULT 0,
  warning_alerts INTEGER DEFAULT 0,
  info_alerts INTEGER DEFAULT 0,
  
  -- Network metrics
  network_latency_ms INTEGER,
  network_packet_loss_pct DECIMAL(5, 2),
  
  -- Metadata
  observed_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes
  INDEX idx_branch_health_tenant_branch (tenant_id, branch_id),
  INDEX idx_branch_health_branch_observed (branch_id, observed_at DESC),
  INDEX idx_branch_health_state (health_state, created_at DESC)
);

COMMENT ON TABLE branch_health_snapshots IS 'Historical snapshots of branch operational health for trending and reporting';
COMMENT ON COLUMN branch_health_snapshots.health_score IS 'Overall health score 0-100, calculated by evaluation rules';
COMMENT ON COLUMN branch_health_snapshots.observed_at IS 'When this health state was observed';


-- Branch Operational Events
-- Timeline of significant operational events
CREATE TABLE IF NOT EXISTS branch_operational_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  
  -- Event classification
  event_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'HIGH', 'CRITICAL')),
  
  -- Event details
  title TEXT NOT NULL,
  description TEXT,
  
  -- Related resources
  camera_id UUID,
  camera_name VARCHAR(255),
  recorder_id UUID,
  alert_id UUID,
  device_id UUID,
  
  -- Timing
  occurred_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Additional context
  metadata JSONB,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes
  INDEX idx_branch_events_branch_occurred (branch_id, occurred_at DESC),
  INDEX idx_branch_events_severity (branch_id, severity, occurred_at DESC),
  INDEX idx_branch_events_type (event_type, occurred_at DESC),
  INDEX idx_branch_events_camera (camera_id, occurred_at DESC)
);

COMMENT ON TABLE branch_operational_events IS 'Timeline of branch operational events for audit and investigation';
COMMENT ON COLUMN branch_operational_events.event_type IS 'Event type: CAMERA_STATUS_CHANGED, RECORDING_STATUS_CHANGED, etc.';
COMMENT ON COLUMN branch_operational_events.metadata IS 'Additional event-specific data in JSON format';


-- Operator Audit Log
-- Track all operator actions for compliance and security
CREATE TABLE IF NOT EXISTS operator_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  
  -- Action classification
  action VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50),
  resource_id UUID,
  
  -- Outcome
  outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('SUCCESS', 'FAILURE', 'DENIED')),
  failure_reason TEXT,
  
  -- Request context
  source_ip INET,
  user_agent TEXT,
  session_id UUID,
  
  -- Timing
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  duration_ms INTEGER,
  
  -- Additional details
  metadata JSONB,
  
  -- Indexes
  INDEX idx_audit_user_timestamp (user_id, timestamp DESC),
  INDEX idx_audit_branch_timestamp (branch_id, timestamp DESC),
  INDEX idx_audit_action_timestamp (action, timestamp DESC),
  INDEX idx_audit_resource (resource_type, resource_id, timestamp DESC),
  INDEX idx_audit_outcome (outcome, timestamp DESC)
);

COMMENT ON TABLE operator_audit_log IS 'Audit log of all operator actions for compliance and investigation';
COMMENT ON COLUMN operator_audit_log.action IS 'Action type: VIEW_LIVE, EXPORT_VIDEO, PTZ_CONTROL, etc.';
COMMENT ON COLUMN operator_audit_log.outcome IS 'Result of the action: SUCCESS, FAILURE, or DENIED';
COMMENT ON COLUMN operator_audit_log.duration_ms IS 'Action execution time in milliseconds';


-- Functions for automatic event recording

-- Function to record camera status change
CREATE OR REPLACE FUNCTION record_camera_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.online_status IS DISTINCT FROM NEW.online_status) THEN
    INSERT INTO branch_operational_events (
      tenant_id,
      branch_id,
      event_type,
      severity,
      title,
      description,
      camera_id,
      camera_name,
      occurred_at,
      metadata
    )
    SELECT
      c.tenant_id,
      c.branch_id,
      'CAMERA_STATUS_CHANGED',
      CASE 
        WHEN NEW.online_status = 'offline' THEN 'HIGH'
        WHEN NEW.online_status = 'online' THEN 'INFO'
        ELSE 'WARNING'
      END,
      CASE 
        WHEN NEW.online_status = 'offline' THEN c.name || ' went offline'
        WHEN NEW.online_status = 'online' THEN c.name || ' came online'
        ELSE c.name || ' status changed to ' || NEW.online_status
      END,
      'Camera status changed from ' || OLD.online_status || ' to ' || NEW.online_status,
      NEW.id,
      c.name,
      NOW(),
      jsonb_build_object(
        'old_status', OLD.online_status,
        'new_status', NEW.online_status,
        'health_score', NEW.health_score
      )
    FROM cameras c
    WHERE c.id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for camera status changes
DROP TRIGGER IF EXISTS trigger_camera_status_change ON cameras;
CREATE TRIGGER trigger_camera_status_change
  AFTER UPDATE ON cameras
  FOR EACH ROW
  EXECUTE FUNCTION record_camera_status_change();


-- Function to record recording status change
CREATE OR REPLACE FUNCTION record_recording_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.recording_status IS DISTINCT FROM NEW.recording_status) THEN
    INSERT INTO branch_operational_events (
      tenant_id,
      branch_id,
      event_type,
      severity,
      title,
      description,
      camera_id,
      camera_name,
      occurred_at,
      metadata
    )
    SELECT
      c.tenant_id,
      c.branch_id,
      'RECORDING_STATUS_CHANGED',
      CASE 
        WHEN NEW.recording_status = 'stopped' OR NEW.recording_status = 'error' THEN 'CRITICAL'
        WHEN NEW.recording_status = 'recording' THEN 'INFO'
        ELSE 'WARNING'
      END,
      CASE 
        WHEN NEW.recording_status = 'stopped' THEN c.name || ' stopped recording'
        WHEN NEW.recording_status = 'recording' THEN c.name || ' started recording'
        ELSE c.name || ' recording status: ' || NEW.recording_status
      END,
      'Recording status changed from ' || OLD.recording_status || ' to ' || NEW.recording_status,
      NEW.id,
      c.name,
      NOW(),
      jsonb_build_object(
        'old_status', OLD.recording_status,
        'new_status', NEW.recording_status
      )
    FROM cameras c
    WHERE c.id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for recording status changes
DROP TRIGGER IF EXISTS trigger_recording_status_change ON cameras;
CREATE TRIGGER trigger_recording_status_change
  AFTER UPDATE ON cameras
  FOR EACH ROW
  EXECUTE FUNCTION record_recording_status_change();


-- Function to create periodic health snapshots
CREATE OR REPLACE FUNCTION create_branch_health_snapshot(p_tenant_id UUID, p_branch_id UUID)
RETURNS UUID AS $$
DECLARE
  v_snapshot_id UUID;
  v_health_data RECORD;
BEGIN
  -- Aggregate current health data
  SELECT
    -- Camera metrics
    COUNT(c.id) as cameras_total,
    COUNT(c.id) FILTER (WHERE c.online_status = 'online') as cameras_online,
    COUNT(c.id) FILTER (WHERE c.recording_status = 'recording') as cameras_recording,
    COUNT(c.id) FILTER (WHERE c.online_status = 'offline') as cameras_offline,
    
    -- Storage metrics
    SUM(dh.capacity_bytes) / (1024.0 * 1024.0 * 1024.0) as storage_total_gb,
    SUM(dh.used_bytes) / (1024.0 * 1024.0 * 1024.0) as storage_used_gb,
    CASE 
      WHEN SUM(dh.capacity_bytes) > 0 
      THEN (SUM(dh.used_bytes)::DECIMAL / SUM(dh.capacity_bytes)) * 100
      ELSE NULL
    END as storage_usage_pct,
    COUNT(dh.id) FILTER (WHERE dh.smart_status IN ('failed', 'failure_predicted')) as disks_failed,
    
    -- Retention metrics
    MIN(cr.retention_days_available) as minimum_retention_days,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cr.retention_days_available) as median_retention_days,
    COUNT(cr.camera_id) FILTER (WHERE cr.retention_days_available < rp.retention_days_required * 0.9) as retention_violations,
    rp.retention_days_required,
    
    -- Alert metrics
    COUNT(a.id) FILTER (WHERE a.severity = 'critical' AND a.status = 'active') as critical_alerts,
    COUNT(a.id) FILTER (WHERE a.severity = 'warning' AND a.status = 'active') as warning_alerts,
    COUNT(a.id) FILTER (WHERE a.severity = 'info' AND a.status = 'active') as info_alerts,
    
    -- Network metrics
    nh.latency_ms as network_latency_ms,
    nh.packet_loss_percent as network_packet_loss_pct
    
  INTO v_health_data
  FROM branches b
  LEFT JOIN cameras c ON c.branch_id = b.id
  LEFT JOIN disk_health dh ON dh.branch_id = b.id
  LEFT JOIN camera_retention cr ON cr.camera_id = c.id
  LEFT JOIN retention_policies rp ON rp.tenant_id = b.tenant_id AND (rp.branch_id = b.id OR rp.branch_id IS NULL)
  LEFT JOIN operational_alerts a ON a.branch_id = b.id
  LEFT JOIN network_health nh ON nh.branch_id = b.id
  WHERE b.id = p_branch_id
    AND b.tenant_id = p_tenant_id
  GROUP BY rp.retention_days_required, nh.latency_ms, nh.packet_loss_percent;
  
  -- Determine overall health state
  DECLARE
    v_health_state VARCHAR(20) := 'HEALTHY';
    v_health_score INTEGER := 100;
  BEGIN
    -- Apply scoring rules
    IF v_health_data.cameras_total > 0 AND v_health_data.cameras_offline = v_health_data.cameras_total THEN
      v_health_state := 'CRITICAL';
      v_health_score := v_health_score - 30;
    ELSIF v_health_data.cameras_offline > 0 THEN
      v_health_state := 'WARNING';
      v_health_score := v_health_score - 10;
    END IF;
    
    IF v_health_data.disks_failed > 0 THEN
      v_health_state := 'CRITICAL';
      v_health_score := v_health_score - 25;
    END IF;
    
    IF v_health_data.storage_usage_pct > 95 THEN
      v_health_state := 'CRITICAL';
      v_health_score := v_health_score - 20;
    ELSIF v_health_data.storage_usage_pct > 85 THEN
      IF v_health_state = 'HEALTHY' THEN v_health_state := 'WARNING'; END IF;
      v_health_score := v_health_score - 10;
    END IF;
    
    IF v_health_data.retention_violations > 0 THEN
      IF v_health_state = 'HEALTHY' THEN v_health_state := 'WARNING'; END IF;
      v_health_score := v_health_score - 15;
    END IF;
    
    IF v_health_data.critical_alerts > 0 THEN
      v_health_state := 'CRITICAL';
      v_health_score := v_health_score - LEAST(v_health_data.critical_alerts * 5, 15);
    END IF;
    
    v_health_score := GREATEST(0, v_health_score);
    
    -- Insert snapshot
    INSERT INTO branch_health_snapshots (
      tenant_id,
      branch_id,
      health_state,
      health_score,
      cameras_total,
      cameras_online,
      cameras_recording,
      cameras_offline,
      storage_total_gb,
      storage_used_gb,
      storage_usage_pct,
      disks_failed,
      required_retention_days,
      minimum_retention_days,
      median_retention_days,
      retention_violations,
      critical_alerts,
      warning_alerts,
      info_alerts,
      network_latency_ms,
      network_packet_loss_pct,
      observed_at
    )
    VALUES (
      p_tenant_id,
      p_branch_id,
      v_health_state,
      v_health_score,
      v_health_data.cameras_total,
      v_health_data.cameras_online,
      v_health_data.cameras_recording,
      v_health_data.cameras_offline,
      v_health_data.storage_total_gb,
      v_health_data.storage_used_gb,
      v_health_data.storage_usage_pct,
      v_health_data.disks_failed,
      v_health_data.retention_days_required,
      v_health_data.minimum_retention_days,
      v_health_data.median_retention_days,
      v_health_data.retention_violations,
      v_health_data.critical_alerts,
      v_health_data.warning_alerts,
      v_health_data.info_alerts,
      v_health_data.network_latency_ms,
      v_health_data.network_packet_loss_pct,
      NOW()
    )
    RETURNING id INTO v_snapshot_id;
    
    RETURN v_snapshot_id;
  END;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_branch_health_snapshot IS 'Creates a health snapshot for a branch, used for periodic monitoring and reporting';


-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cameras_branch_status ON cameras(branch_id, online_status, recording_status);
CREATE INDEX IF NOT EXISTS idx_disk_health_branch ON disk_health(branch_id, smart_status);
CREATE INDEX IF NOT EXISTS idx_camera_retention_branch ON camera_retention(camera_id, retention_days_available);
CREATE INDEX IF NOT EXISTS idx_operational_alerts_branch ON operational_alerts(branch_id, severity, status);


-- Grant permissions
GRANT SELECT, INSERT ON branch_health_snapshots TO app_user;
GRANT SELECT, INSERT ON branch_operational_events TO app_user;
GRANT SELECT, INSERT ON operator_audit_log TO app_user;
GRANT EXECUTE ON FUNCTION create_branch_health_snapshot TO app_user;
