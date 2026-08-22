-- ============================================
-- Infrastructure-RCA Integration Schema
-- ============================================
-- This migration adds tables to store correlations between
-- infrastructure failures and surveillance incidents, enabling
-- automatic root cause analysis.

-- ===========================================
-- Table: infrastructure_rca_correlations
-- ===========================================
-- Stores the correlation between camera incidents and infrastructure root causes
CREATE TABLE IF NOT EXISTS infrastructure_rca_correlations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  camera_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  
  -- Incident details
  incident_type VARCHAR(50) NOT NULL, -- 'offline', 'poor_quality', 'recording_gap', 'connection_lost'
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Root cause analysis
  root_cause_type VARCHAR(50) NOT NULL, -- 'switch_port', 'switch_device', 'ups_power', 'firewall', 'network_link', 'unknown'
  root_cause_confidence DECIMAL(3,2) NOT NULL CHECK (root_cause_confidence >= 0 AND root_cause_confidence <= 1),
  root_cause_explanation TEXT NOT NULL,
  
  -- Affected components (JSON array)
  affected_components JSONB NOT NULL DEFAULT '[]',
  
  -- Recommendations (JSON array)
  recommended_actions JSONB NOT NULL DEFAULT '[]',
  
  -- Troubleshooting path (JSON array)
  troubleshooting_path JSONB NOT NULL DEFAULT '[]',
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Indexes
  CONSTRAINT fk_rca_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_rca_camera FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE CASCADE,
  CONSTRAINT fk_rca_branch FOREIGN KEY (branch_id) REFERENCES resource_nodes(id) ON DELETE CASCADE
);

CREATE INDEX idx_rca_correlations_camera ON infrastructure_rca_correlations(camera_id, created_at DESC);
CREATE INDEX idx_rca_correlations_branch ON infrastructure_rca_correlations(branch_id, created_at DESC);
CREATE INDEX idx_rca_correlations_tenant ON infrastructure_rca_correlations(tenant_id, created_at DESC);
CREATE INDEX idx_rca_correlations_root_cause ON infrastructure_rca_correlations(root_cause_type, tenant_id);
CREATE INDEX idx_rca_correlations_confidence ON infrastructure_rca_correlations(root_cause_confidence) WHERE root_cause_confidence > 0.7;

COMMENT ON TABLE infrastructure_rca_correlations IS 'Correlations between camera incidents and infrastructure root causes';
COMMENT ON COLUMN infrastructure_rca_correlations.root_cause_confidence IS 'Confidence score 0-1, where 0.7+ indicates high confidence';
COMMENT ON COLUMN infrastructure_rca_correlations.affected_components IS 'Array of infrastructure components involved in the incident';
COMMENT ON COLUMN infrastructure_rca_correlations.troubleshooting_path IS 'Step-by-step troubleshooting path taken by RCA engine';

-- ===========================================
-- Table: unified_incidents
-- ===========================================
-- Unified view of incidents spanning surveillance and infrastructure
CREATE TABLE IF NOT EXISTS unified_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- Incident classification
  incident_type VARCHAR(100) NOT NULL, -- 'camera_offline_infrastructure', 'branch_wide_outage', etc.
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'investigating', 'resolved', 'closed')),
  
  -- Source tracking
  source_system VARCHAR(50) NOT NULL, -- 'rca_correlation', 'manual', 'automated_detection'
  source_id UUID, -- Reference to source entity (camera, alert, etc.)
  branch_id UUID NOT NULL,
  
  -- Incident details
  title VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Root cause
  root_cause_type VARCHAR(50),
  root_cause_confidence DECIMAL(3,2),
  
  -- Affected systems (JSONB arrays)
  affected_surveillance_devices JSONB DEFAULT '[]',
  affected_infrastructure_devices JSONB DEFAULT '[]',
  
  -- Response tracking
  recommended_actions JSONB DEFAULT '[]',
  actions_taken JSONB DEFAULT '[]',
  
  -- Resolution
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID,
  resolution_notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT fk_unified_incident_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_unified_incident_branch FOREIGN KEY (branch_id) REFERENCES resource_nodes(id) ON DELETE CASCADE
);

CREATE INDEX idx_unified_incidents_tenant ON unified_incidents(tenant_id, status, created_at DESC);
CREATE INDEX idx_unified_incidents_branch ON unified_incidents(branch_id, status, created_at DESC);
CREATE INDEX idx_unified_incidents_severity ON unified_incidents(severity, status) WHERE status = 'active';
CREATE INDEX idx_unified_incidents_root_cause ON unified_incidents(root_cause_type, tenant_id);
CREATE INDEX idx_unified_incidents_created ON unified_incidents(created_at DESC);

COMMENT ON TABLE unified_incidents IS 'Unified incident tracking spanning surveillance and infrastructure domains';
COMMENT ON COLUMN unified_incidents.source_system IS 'System that created the incident (rca_correlation, manual, automated_detection)';
COMMENT ON COLUMN unified_incidents.affected_surveillance_devices IS 'JSON array of affected cameras, recorders, etc.';
COMMENT ON COLUMN unified_incidents.affected_infrastructure_devices IS 'JSON array of affected switches, UPS, firewalls, etc.';

-- ===========================================
-- Table: rca_investigation_cache
-- ===========================================
-- Cache for RCA investigation results to avoid redundant checks
CREATE TABLE IF NOT EXISTS rca_investigation_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  camera_id UUID NOT NULL,
  
  -- Cache key (hash of investigation parameters)
  cache_key VARCHAR(64) NOT NULL UNIQUE,
  
  -- Cached result
  root_cause_type VARCHAR(50),
  root_cause_confidence DECIMAL(3,2),
  investigation_result JSONB NOT NULL,
  
  -- Cache metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  hit_count INTEGER DEFAULT 0,
  
  CONSTRAINT fk_rca_cache_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_rca_cache_branch FOREIGN KEY (branch_id) REFERENCES resource_nodes(id) ON DELETE CASCADE,
  CONSTRAINT fk_rca_cache_camera FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE CASCADE
);

CREATE INDEX idx_rca_cache_key ON rca_investigation_cache(cache_key);
CREATE INDEX idx_rca_cache_expires ON rca_investigation_cache(expires_at);
CREATE INDEX idx_rca_cache_camera ON rca_investigation_cache(camera_id, created_at DESC);

COMMENT ON TABLE rca_investigation_cache IS 'Cache for RCA investigation results to improve performance';
COMMENT ON COLUMN rca_investigation_cache.cache_key IS 'SHA-256 hash of investigation parameters';
COMMENT ON COLUMN rca_investigation_cache.expires_at IS 'Cache expiry time (typically 5-15 minutes)';

-- ===========================================
-- View: vw_active_infrastructure_incidents
-- ===========================================
-- Simplified view of active infrastructure incidents
CREATE OR REPLACE VIEW vw_active_infrastructure_incidents AS
SELECT 
  ui.id,
  ui.tenant_id,
  ui.branch_id,
  rn.name as branch_name,
  ui.incident_type,
  ui.severity,
  ui.title,
  ui.root_cause_type,
  ui.root_cause_confidence,
  jsonb_array_length(ui.affected_surveillance_devices) as cameras_affected,
  jsonb_array_length(ui.affected_infrastructure_devices) as infrastructure_affected,
  ui.recommended_actions,
  ui.created_at,
  EXTRACT(EPOCH FROM (NOW() - ui.created_at))/60 as age_minutes
FROM unified_incidents ui
JOIN resource_nodes rn ON rn.id = ui.branch_id
WHERE ui.status = 'active'
  AND ui.root_cause_type IS NOT NULL
ORDER BY 
  CASE ui.severity
    WHEN 'critical' THEN 1
    WHEN 'warning' THEN 2
    WHEN 'info' THEN 3
  END,
  ui.created_at DESC;

COMMENT ON VIEW vw_active_infrastructure_incidents IS 'Active infrastructure-related incidents with calculated metrics';

-- ===========================================
-- View: vw_rca_correlation_statistics
-- ===========================================
-- Statistics on RCA correlation accuracy and patterns
CREATE OR REPLACE VIEW vw_rca_correlation_statistics AS
SELECT 
  tenant_id,
  branch_id,
  root_cause_type,
  COUNT(*) as total_incidents,
  AVG(root_cause_confidence) as avg_confidence,
  COUNT(*) FILTER (WHERE root_cause_confidence > 0.8) as high_confidence_count,
  COUNT(*) FILTER (WHERE root_cause_confidence > 0.5 AND root_cause_confidence <= 0.8) as medium_confidence_count,
  COUNT(*) FILTER (WHERE root_cause_confidence <= 0.5) as low_confidence_count,
  COUNT(DISTINCT camera_id) as unique_cameras_affected,
  MIN(created_at) as first_occurrence,
  MAX(created_at) as last_occurrence
FROM infrastructure_rca_correlations
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY tenant_id, branch_id, root_cause_type;

COMMENT ON VIEW vw_rca_correlation_statistics IS '30-day statistics on RCA correlation patterns and accuracy';

-- ===========================================
-- Function: cleanup_expired_rca_cache
-- ===========================================
-- Cleanup function for expired RCA cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_rca_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM rca_investigation_cache
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_rca_cache IS 'Deletes expired RCA investigation cache entries';

-- ===========================================
-- Function: get_camera_infrastructure_path
-- ===========================================
-- Get the infrastructure path for a camera (camera → switch → firewall → UPS)
CREATE OR REPLACE FUNCTION get_camera_infrastructure_path(p_camera_id UUID)
RETURNS TABLE (
  device_type VARCHAR,
  device_id UUID,
  device_name VARCHAR,
  health_score INTEGER,
  status VARCHAR
) AS $$
BEGIN
  RETURN QUERY
    -- Camera itself
    SELECT 
      'camera'::VARCHAR as device_type,
      c.id as device_id,
      c.name as device_name,
      NULL::INTEGER as health_score,
      CASE 
        WHEN c.last_seen_at > NOW() - INTERVAL '5 minutes' THEN 'online'
        ELSE 'offline'
      END::VARCHAR as status
    FROM cameras c
    WHERE c.id = p_camera_id;

  RETURN QUERY
    -- Connected switch
    SELECT 
      'switch'::VARCHAR,
      ns.id,
      ns.name,
      shm.health_score::INTEGER,
      shm.health_status::VARCHAR
    FROM cameras c
    JOIN network_topology_nodes ntn ON ntn.target_device_id = c.id AND ntn.target_device_type = 'camera'
    JOIN network_switches ns ON ns.id = ntn.source_device_id
    LEFT JOIN LATERAL (
      SELECT health_score, health_status
      FROM switch_health_metrics
      WHERE switch_id = ns.id
      ORDER BY observed_at DESC
      LIMIT 1
    ) shm ON true
    WHERE c.id = p_camera_id;

  RETURN QUERY
    -- Branch firewall
    SELECT 
      'firewall'::VARCHAR,
      f.id,
      f.name,
      fhm.health_score::INTEGER,
      fhm.health_status::VARCHAR
    FROM cameras c
    JOIN firewalls f ON f.branch_id = c.branch_id
    LEFT JOIN LATERAL (
      SELECT health_score, health_status
      FROM firewall_health_metrics
      WHERE firewall_id = f.id
      ORDER BY observed_at DESC
      LIMIT 1
    ) fhm ON true
    WHERE c.id = p_camera_id;

  RETURN QUERY
    -- Branch UPS
    SELECT 
      'ups'::VARCHAR,
      u.id,
      u.name,
      uhm.health_score::INTEGER,
      uhm.health_status::VARCHAR
    FROM cameras c
    JOIN ups_devices u ON u.branch_id = c.branch_id
    LEFT JOIN LATERAL (
      SELECT health_score, health_status
      FROM ups_health_metrics
      WHERE ups_id = u.id
      ORDER BY observed_at DESC
      LIMIT 1
    ) uhm ON true
    WHERE c.id = p_camera_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_camera_infrastructure_path IS 'Returns the complete infrastructure path for a camera';

-- ===========================================
-- Grants
-- ===========================================
-- Grant permissions only if app_user role exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE ON infrastructure_rca_correlations TO app_user;
    GRANT SELECT, INSERT, UPDATE ON unified_incidents TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON rca_investigation_cache TO app_user;
    GRANT SELECT ON vw_active_infrastructure_incidents TO app_user;
    GRANT SELECT ON vw_rca_correlation_statistics TO app_user;
    GRANT EXECUTE ON FUNCTION cleanup_expired_rca_cache TO app_user;
    GRANT EXECUTE ON FUNCTION get_camera_infrastructure_path TO app_user;
  END IF;
END $$;

-- ===========================================
-- Indexes for Performance
-- ===========================================
-- Additional indexes for common query patterns
CREATE INDEX idx_unified_incidents_composite ON unified_incidents(tenant_id, branch_id, status, severity, created_at DESC);
CREATE INDEX idx_rca_correlations_composite ON infrastructure_rca_correlations(tenant_id, branch_id, root_cause_type, created_at DESC);

-- ===========================================
-- Sample Data (Optional - for testing)
-- ===========================================
-- Uncomment to insert sample data for testing

/*
INSERT INTO infrastructure_rca_correlations (
  tenant_id,
  camera_id,
  branch_id,
  incident_type,
  detected_at,
  root_cause_type,
  root_cause_confidence,
  root_cause_explanation,
  affected_components,
  recommended_actions,
  troubleshooting_path
) VALUES (
  '00000000-0000-0000-0000-000000000001', -- Replace with actual tenant_id
  '00000000-0000-0000-0000-000000000002', -- Replace with actual camera_id
  '00000000-0000-0000-0000-000000000003', -- Replace with actual branch_id
  'offline',
  NOW() - INTERVAL '1 hour',
  'switch_port',
  0.95,
  'Camera is offline because switch port 24 has lost PoE power',
  '[{"componentType":"switch_port","componentId":"sw-001-24","componentName":"Core-Switch Port 24","status":"down"}]'::jsonb,
  '["Check physical cable connection","Verify PoE budget on switch","Test with known-good PoE injector"]'::jsonb,
  '["Camera: CAM-101 (offline)","Checking switch port: Core-Switch port 24","Switch port is DOWN","PoE device not detected (power issue)"]'::jsonb
);
*/
