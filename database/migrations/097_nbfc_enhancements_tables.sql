-- ==============================================================================
-- 097: NBFC Enhancements - ANPR Logistics, Device Health, Watchlist, Comparison
-- ==============================================================================

-- ============================================================================
-- ANPR Logistics Tables
-- ============================================================================

-- Cash-van sessions tracked via ANPR
CREATE TABLE IF NOT EXISTS anpr_logistics_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  vehicle_plate VARCHAR(50) NOT NULL,
  vehicle_type VARCHAR(50) DEFAULT 'cash_van',
  status VARCHAR(50) DEFAULT 'on_route',
  route_compliance VARCHAR(50) DEFAULT 'compliant',
  scheduled_arrival TIMESTAMPTZ NOT NULL,
  actual_arrival TIMESTAMPTZ,
  departure_time TIMESTAMPTZ,
  dwell_time_minutes INTEGER,
  authorized BOOLEAN DEFAULT false,
  provider VARCHAR(200),
  confidence DECIMAL(5,4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fk_anpr_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_anpr_logistics_sessions_tenant ON anpr_logistics_sessions(tenant_id);
CREATE INDEX idx_anpr_logistics_sessions_branch ON anpr_logistics_sessions(branch_id);
CREATE INDEX idx_anpr_logistics_sessions_status ON anpr_logistics_sessions(status);
CREATE INDEX idx_anpr_logistics_sessions_plate ON anpr_logistics_sessions(vehicle_plate);
CREATE INDEX idx_anpr_logistics_sessions_scheduled ON anpr_logistics_sessions(scheduled_arrival);

-- ANPR detection points for vehicle tracking
CREATE TABLE IF NOT EXISTS anpr_detection_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES anpr_logistics_sessions(id) ON DELETE CASCADE,
  camera_id UUID NOT NULL,
  camera_name VARCHAR(200),
  location VARCHAR(200),
  detected_at TIMESTAMPTZ NOT NULL,
  confidence DECIMAL(5,4) DEFAULT 0,
  snapshot_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_anpr_detections_session ON anpr_detection_points(session_id);
CREATE INDEX idx_anpr_detections_camera ON anpr_detection_points(camera_id);
CREATE INDEX idx_anpr_detections_time ON anpr_detection_points(detected_at);

-- ANPR violations
CREATE TABLE IF NOT EXISTS anpr_logistics_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES anpr_logistics_sessions(id) ON DELETE CASCADE,
  violation_code VARCHAR(100) NOT NULL,
  violation_name VARCHAR(200),
  severity VARCHAR(50) DEFAULT 'medium',
  message TEXT,
  detected_at TIMESTAMPTZ NOT NULL,
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_anpr_violations_session ON anpr_logistics_violations(session_id);
CREATE INDEX idx_anpr_violations_severity ON anpr_logistics_violations(severity);
CREATE INDEX idx_anpr_violations_resolved ON anpr_logistics_violations(resolved);

-- ============================================================================
-- Device Health Correlation Tables
-- ============================================================================

-- Correlated device health snapshot per branch
CREATE TABLE IF NOT EXISTS device_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  snapshot_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  overall_health VARCHAR(50) DEFAULT 'unknown',
  
  -- Camera metrics
  cameras_total INTEGER DEFAULT 0,
  cameras_online INTEGER DEFAULT 0,
  cameras_recording INTEGER DEFAULT 0,
  cameras_healthy INTEGER DEFAULT 0,
  cameras_warning INTEGER DEFAULT 0,
  cameras_critical INTEGER DEFAULT 0,
  cameras_offline INTEGER DEFAULT 0,
  camera_health_score DECIMAL(5,2) DEFAULT 0,
  
  -- Recorder metrics
  recorders_total INTEGER DEFAULT 0,
  recorders_online INTEGER DEFAULT 0,
  recorders_healthy INTEGER DEFAULT 0,
  recorders_degraded INTEGER DEFAULT 0,
  recorders_full INTEGER DEFAULT 0,
  recorders_offline INTEGER DEFAULT 0,
  
  -- Network metrics
  network_status VARCHAR(50) DEFAULT 'unknown',
  network_latency_ms INTEGER DEFAULT 0,
  network_packet_loss DECIMAL(5,2) DEFAULT 0,
  network_bandwidth_mbps INTEGER DEFAULT 0,
  
  -- Power metrics
  power_status VARCHAR(50) DEFAULT 'unknown',
  ups_online BOOLEAN DEFAULT true,
  ups_battery_percent INTEGER DEFAULT 100,
  power_outages_24h INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure all columns exist if table was already created by migration 042
ALTER TABLE device_health_snapshots ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE device_health_snapshots ADD COLUMN IF NOT EXISTS snapshot_time TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE device_health_snapshots ADD COLUMN IF NOT EXISTS overall_health VARCHAR(50) DEFAULT 'unknown';
ALTER TABLE device_health_snapshots ADD COLUMN IF NOT EXISTS cameras_total INTEGER DEFAULT 0;
ALTER TABLE device_health_snapshots ADD COLUMN IF NOT EXISTS cameras_online INTEGER DEFAULT 0;
ALTER TABLE device_health_snapshots ADD COLUMN IF NOT EXISTS cameras_recording INTEGER DEFAULT 0;
ALTER TABLE device_health_snapshots ADD COLUMN IF NOT EXISTS cameras_healthy INTEGER DEFAULT 0;
ALTER TABLE device_health_snapshots ADD COLUMN IF NOT EXISTS cameras_warning INTEGER DEFAULT 0;
ALTER TABLE device_health_snapshots ADD COLUMN IF NOT EXISTS cameras_critical INTEGER DEFAULT 0;
ALTER TABLE device_health_snapshots ADD COLUMN IF NOT EXISTS cameras_offline INTEGER DEFAULT 0;
ALTER TABLE device_health_snapshots ADD COLUMN IF NOT EXISTS camera_health_score DECIMAL(5,2) DEFAULT 0;
ALTER TABLE device_health_snapshots ADD COLUMN IF NOT EXISTS recorders_total INTEGER DEFAULT 0;
ALTER TABLE device_health_snapshots ADD COLUMN IF NOT EXISTS recorders_online INTEGER DEFAULT 0;
ALTER TABLE device_health_snapshots ADD COLUMN IF NOT EXISTS recorders_healthy INTEGER DEFAULT 0;
ALTER TABLE device_health_snapshots ADD COLUMN IF NOT EXISTS recorders_degraded INTEGER DEFAULT 0;
ALTER TABLE device_health_snapshots ADD COLUMN IF NOT EXISTS recorders_full INTEGER DEFAULT 0;
ALTER TABLE device_health_snapshots ADD COLUMN IF NOT EXISTS recorders_offline INTEGER DEFAULT 0;
ALTER TABLE device_health_snapshots ADD COLUMN IF NOT EXISTS network_status VARCHAR(50) DEFAULT 'unknown';
ALTER TABLE device_health_snapshots ADD COLUMN IF NOT EXISTS network_latency_ms INTEGER DEFAULT 0;
ALTER TABLE device_health_snapshots ADD COLUMN IF NOT EXISTS network_packet_loss DECIMAL(5,2) DEFAULT 0;
ALTER TABLE device_health_snapshots ADD COLUMN IF NOT EXISTS network_bandwidth_mbps INTEGER DEFAULT 0;
ALTER TABLE device_health_snapshots ADD COLUMN IF NOT EXISTS power_status VARCHAR(50) DEFAULT 'unknown';
ALTER TABLE device_health_snapshots ADD COLUMN IF NOT EXISTS ups_online BOOLEAN DEFAULT true;
ALTER TABLE device_health_snapshots ADD COLUMN IF NOT EXISTS ups_battery_percent INTEGER DEFAULT 100;
ALTER TABLE device_health_snapshots ADD COLUMN IF NOT EXISTS power_outages_24h INTEGER DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='device_health_snapshots' AND column_name='device_id' AND is_nullable='NO') THEN
    ALTER TABLE device_health_snapshots ALTER COLUMN device_id DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='device_health_snapshots' AND column_name='device_type' AND is_nullable='NO') THEN
    ALTER TABLE device_health_snapshots ALTER COLUMN device_type DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='device_health_snapshots' AND column_name='snapshot_timestamp' AND is_nullable='NO') THEN
    ALTER TABLE device_health_snapshots ALTER COLUMN snapshot_timestamp DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='device_health_snapshots' AND column_name='health_score' AND is_nullable='NO') THEN
    ALTER TABLE device_health_snapshots ALTER COLUMN health_score DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='device_health_snapshots' AND column_name='metrics' AND is_nullable='NO') THEN
    ALTER TABLE device_health_snapshots ALTER COLUMN metrics DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE device_health_snapshots DROP CONSTRAINT IF EXISTS device_health_snapshots_unique;
ALTER TABLE device_health_snapshots DROP CONSTRAINT IF EXISTS device_health_snapshots_device_type_check;
ALTER TABLE device_health_snapshots DROP CONSTRAINT IF EXISTS device_health_snapshots_health_score_check;

CREATE INDEX IF NOT EXISTS idx_device_health_tenant ON device_health_snapshots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_device_health_branch ON device_health_snapshots(branch_id);
CREATE INDEX IF NOT EXISTS idx_device_health_time ON device_health_snapshots(snapshot_time DESC);
CREATE INDEX IF NOT EXISTS idx_device_health_overall ON device_health_snapshots(overall_health);

-- Critical device issues
CREATE TABLE IF NOT EXISTS device_critical_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  device_type VARCHAR(50) NOT NULL, -- camera, recorder, network, power
  device_id VARCHAR(200),
  severity VARCHAR(50) DEFAULT 'medium',
  message TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_device_issues_tenant ON device_critical_issues(tenant_id);
CREATE INDEX idx_device_issues_branch ON device_critical_issues(branch_id);
CREATE INDEX idx_device_issues_type ON device_critical_issues(device_type);
CREATE INDEX idx_device_issues_severity ON device_critical_issues(severity);
CREATE INDEX idx_device_issues_resolved ON device_critical_issues(resolved);

-- Correlated events (root cause analysis)
CREATE TABLE IF NOT EXISTS device_correlated_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  affected_devices JSONB DEFAULT '[]',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  confidence DECIMAL(5,4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_correlated_events_tenant ON device_correlated_events(tenant_id);
CREATE INDEX idx_correlated_events_branch ON device_correlated_events(branch_id);
CREATE INDEX idx_correlated_events_type ON device_correlated_events(event_type);
CREATE INDEX idx_correlated_events_resolved ON device_correlated_events(resolved);

-- ============================================================================
-- Watchlist Management Tables
-- ============================================================================

-- NBFC-specific watchlist entries
CREATE TABLE IF NOT EXISTS nbfc_watchlist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  person_id UUID, -- Link to secure_area_authorized_persons if exists
  full_name VARCHAR(200) NOT NULL,
  employee_code VARCHAR(100),
  designation VARCHAR(200),
  watchlist_type VARCHAR(50) NOT NULL, -- authorized, blacklist, vip, visitor
  status VARCHAR(50) DEFAULT 'active', -- active, expired, suspended
  branch_ids JSONB DEFAULT '[]',
  area_access JSONB DEFAULT '[]', -- vault, cash_counter, atm, locker, branch_entry
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ,
  added_by UUID NOT NULL,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT,
  face_enrolled BOOLEAN DEFAULT false,
  face_embedding_id UUID, -- Link to face embeddings table
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_watchlist_tenant ON nbfc_watchlist_entries(tenant_id);
CREATE INDEX idx_watchlist_type ON nbfc_watchlist_entries(watchlist_type);
CREATE INDEX idx_watchlist_status ON nbfc_watchlist_entries(status);
CREATE INDEX idx_watchlist_person ON nbfc_watchlist_entries(person_id);
CREATE INDEX idx_watchlist_employee ON nbfc_watchlist_entries(employee_code);
CREATE INDEX idx_watchlist_valid ON nbfc_watchlist_entries(valid_from, valid_until);

-- Watchlist detection events
CREATE TABLE IF NOT EXISTS nbfc_watchlist_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  watchlist_entry_id UUID NOT NULL REFERENCES nbfc_watchlist_entries(id) ON DELETE CASCADE,
  camera_id UUID NOT NULL,
  camera_name VARCHAR(200),
  branch_id UUID,
  branch_name VARCHAR(200),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confidence DECIMAL(5,4) DEFAULT 0,
  snapshot_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_watchlist_detections_tenant ON nbfc_watchlist_detections(tenant_id);
CREATE INDEX idx_watchlist_detections_entry ON nbfc_watchlist_detections(watchlist_entry_id);
CREATE INDEX idx_watchlist_detections_camera ON nbfc_watchlist_detections(camera_id);
CREATE INDEX idx_watchlist_detections_time ON nbfc_watchlist_detections(detected_at DESC);

-- ============================================================================
-- Branch Comparison Cache
-- ============================================================================

-- Pre-computed branch metrics for fast comparison
CREATE TABLE IF NOT EXISTS branch_comparison_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  branch_name VARCHAR(200),
  branch_code VARCHAR(100),
  metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Compliance metrics
  overall_compliance_score DECIMAL(5,2) DEFAULT 0,
  recording_compliance DECIMAL(5,2) DEFAULT 0,
  storage_health DECIMAL(5,2) DEFAULT 0,
  maintenance_score DECIMAL(5,2) DEFAULT 0,
  
  -- Camera health
  camera_health_score DECIMAL(5,2) DEFAULT 0,
  cameras_total INTEGER DEFAULT 0,
  cameras_online INTEGER DEFAULT 0,
  cameras_healthy INTEGER DEFAULT 0,
  
  -- Security
  active_rules INTEGER DEFAULT 0,
  today_alerts INTEGER DEFAULT 0,
  critical_alerts INTEGER DEFAULT 0,
  violation_rate DECIMAL(5,2) DEFAULT 0,
  
  -- Banking
  cash_van_sessions INTEGER DEFAULT 0,
  compliant_sessions INTEGER DEFAULT 0,
  banking_violations INTEGER DEFAULT 0,
  banking_compliance_rate DECIMAL(5,2) DEFAULT 0,
  
  -- Performance
  avg_response_time_ms INTEGER DEFAULT 0,
  uptime_percent DECIMAL(5,2) DEFAULT 0,
  last_incident_days INTEGER DEFAULT 0,
  
  -- Ranking
  branch_rank INTEGER DEFAULT 0,
  trend VARCHAR(50) DEFAULT 'stable', -- up, down, stable
  
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_branch_comparison_tenant ON branch_comparison_metrics(tenant_id);
CREATE INDEX idx_branch_comparison_branch ON branch_comparison_metrics(branch_id);
CREATE INDEX idx_branch_comparison_date ON branch_comparison_metrics(metric_date DESC);
CREATE INDEX idx_branch_comparison_rank ON branch_comparison_metrics(branch_rank);
CREATE INDEX idx_branch_comparison_computed ON branch_comparison_metrics(computed_at DESC);

-- Unique constraint to prevent duplicate metrics per branch per day
CREATE UNIQUE INDEX idx_branch_comparison_unique ON branch_comparison_metrics(tenant_id, branch_id, metric_date);

-- ============================================================================
-- Functions and Triggers
-- ============================================================================

-- Function to update anpr_logistics_sessions.updated_at
CREATE OR REPLACE FUNCTION update_anpr_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_anpr_session_updated
BEFORE UPDATE ON anpr_logistics_sessions
FOR EACH ROW
EXECUTE FUNCTION update_anpr_session_timestamp();

-- Function to update nbfc_watchlist_entries.updated_at
CREATE OR REPLACE FUNCTION update_watchlist_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_watchlist_updated
BEFORE UPDATE ON nbfc_watchlist_entries
FOR EACH ROW
EXECUTE FUNCTION update_watchlist_timestamp();

-- ============================================================================
-- Views for Quick Access
-- ============================================================================

-- Active ANPR sessions view
CREATE OR REPLACE VIEW v_active_anpr_sessions AS
SELECT 
  s.*,
  COUNT(DISTINCT d.id) as detection_count,
  COUNT(DISTINCT v.id) as violation_count,
  MAX(d.detected_at) as last_detection_at
FROM anpr_logistics_sessions s
LEFT JOIN anpr_detection_points d ON s.id = d.session_id
LEFT JOIN anpr_logistics_violations v ON s.id = v.session_id AND v.resolved = false
WHERE s.status IN ('on_route', 'arrived', 'overdue')
GROUP BY s.id;

-- Watchlist entries with detection counts
CREATE OR REPLACE VIEW v_watchlist_with_detections AS
SELECT 
  w.*,
  COUNT(DISTINCT d.id) as total_detections,
  COUNT(DISTINCT CASE WHEN d.detected_at > NOW() - INTERVAL '24 hours' THEN d.id END) as detections_24h,
  MAX(d.detected_at) as last_detected_at,
  MAX(d.camera_name) as last_camera_name,
  MAX(d.branch_name) as last_branch_name,
  MAX(d.confidence) as last_confidence
FROM nbfc_watchlist_entries w
LEFT JOIN nbfc_watchlist_detections d ON w.id = d.watchlist_entry_id
GROUP BY w.id;

-- Current device health by branch
CREATE OR REPLACE VIEW v_current_device_health AS
SELECT DISTINCT ON (branch_id)
  *
FROM device_health_snapshots
ORDER BY branch_id, snapshot_time DESC;

-- ============================================================================
-- Sample Data for Development (Optional - Remove in Production)
-- ============================================================================

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON anpr_logistics_sessions TO sentinel_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON anpr_detection_points TO sentinel_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON anpr_logistics_violations TO sentinel_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON device_health_snapshots TO sentinel_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON device_critical_issues TO sentinel_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON device_correlated_events TO sentinel_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON nbfc_watchlist_entries TO sentinel_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON nbfc_watchlist_detections TO sentinel_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON branch_comparison_metrics TO sentinel_app;

GRANT SELECT ON v_active_anpr_sessions TO sentinel_app;
GRANT SELECT ON v_watchlist_with_detections TO sentinel_app;
GRANT SELECT ON v_current_device_health TO sentinel_app;

-- Comments for documentation
COMMENT ON TABLE anpr_logistics_sessions IS 'Cash-van tracking via ANPR for NBFC branch security';
COMMENT ON TABLE device_health_snapshots IS 'Correlated device health metrics for cameras, recorders, network, and power';
COMMENT ON TABLE nbfc_watchlist_entries IS 'Face recognition watchlist for authorized personnel, VIPs, and security alerts';
COMMENT ON TABLE branch_comparison_metrics IS 'Pre-computed metrics for multi-branch performance comparison';
