-- Feature Management System
-- Enable/Disable features at tenant and global level
-- Migration: 020

-- ============================================================================
-- Global Feature Flags
-- ============================================================================
-- Controls platform-wide feature availability
CREATE TABLE IF NOT EXISTS global_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Feature identification
  feature_key VARCHAR(100) NOT NULL UNIQUE,
  feature_name VARCHAR(200) NOT NULL,
  feature_category VARCHAR(50) NOT NULL,
  description TEXT,
  
  -- Status
  enabled BOOLEAN NOT NULL DEFAULT false,
  
  -- Metadata
  config JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Index for fast lookups
  CONSTRAINT check_feature_key_format CHECK (feature_key ~ '^[a-z0-9-]+$')
);

CREATE INDEX idx_global_features_key ON global_features(feature_key);
CREATE INDEX idx_global_features_enabled ON global_features(enabled);
CREATE INDEX idx_global_features_category ON global_features(feature_category);

-- ============================================================================
-- Tenant Feature Flags
-- ============================================================================
-- Per-tenant feature overrides
CREATE TABLE IF NOT EXISTS tenant_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- References
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feature_key VARCHAR(100) NOT NULL,
  
  -- Status
  enabled BOOLEAN NOT NULL,
  
  -- Usage tracking
  usage_limit INTEGER, -- NULL = unlimited
  usage_count INTEGER NOT NULL DEFAULT 0,
  
  -- Metadata
  config JSONB DEFAULT '{}',
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- Feature expiration date
  
  -- Constraints
  UNIQUE(tenant_id, feature_key),
  FOREIGN KEY (feature_key) REFERENCES global_features(feature_key) ON DELETE CASCADE
);

CREATE INDEX idx_tenant_features_tenant ON tenant_features(tenant_id);
CREATE INDEX idx_tenant_features_key ON tenant_features(feature_key);
CREATE INDEX idx_tenant_features_enabled ON tenant_features(tenant_id, enabled);
CREATE INDEX idx_tenant_features_expires ON tenant_features(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================================================
-- Feature Usage Logs
-- ============================================================================
-- Track feature usage for analytics and billing
CREATE TABLE IF NOT EXISTS feature_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- References
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feature_key VARCHAR(100) NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Usage details
  action VARCHAR(50) NOT NULL, -- 'access', 'execute', 'api_call', etc.
  metadata JSONB DEFAULT '{}',
  
  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feature_usage_tenant ON feature_usage_logs(tenant_id, created_at DESC);
CREATE INDEX idx_feature_usage_key ON feature_usage_logs(feature_key, created_at DESC);
CREATE INDEX idx_feature_usage_user ON feature_usage_logs(user_id, created_at DESC);

-- Partition by month for performance (optional, for high-volume systems)
-- CREATE TABLE feature_usage_logs_2024_01 PARTITION OF feature_usage_logs
-- FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- ============================================================================
-- Audit Trail for Feature Changes
-- ============================================================================
CREATE TABLE IF NOT EXISTS feature_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- What changed
  feature_key VARCHAR(100) NOT NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL, -- NULL = global change
  
  -- Change details
  action VARCHAR(50) NOT NULL, -- 'enabled', 'disabled', 'config_updated', 'created', 'deleted'
  old_value JSONB,
  new_value JSONB,
  
  -- Who made the change
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ip_address INET,
  user_agent TEXT,
  
  -- When
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feature_audit_key ON feature_audit_log(feature_key, created_at DESC);
CREATE INDEX idx_feature_audit_tenant ON feature_audit_log(tenant_id, created_at DESC);
CREATE INDEX idx_feature_audit_user ON feature_audit_log(changed_by, created_at DESC);

-- ============================================================================
-- Functions
-- ============================================================================

-- Function to check if a feature is enabled for a tenant
CREATE OR REPLACE FUNCTION is_feature_enabled(
  p_tenant_id UUID,
  p_feature_key VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
  v_global_enabled BOOLEAN;
  v_tenant_enabled BOOLEAN;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Check if feature exists globally and is enabled
  SELECT enabled INTO v_global_enabled
  FROM global_features
  WHERE feature_key = p_feature_key;
  
  -- Feature doesn't exist or disabled globally
  IF v_global_enabled IS NULL OR v_global_enabled = FALSE THEN
    RETURN FALSE;
  END IF;
  
  -- Check tenant-specific override
  SELECT enabled, expires_at INTO v_tenant_enabled, v_expires_at
  FROM tenant_features
  WHERE tenant_id = p_tenant_id 
    AND feature_key = p_feature_key;
  
  -- No tenant override = use global setting
  IF v_tenant_enabled IS NULL THEN
    RETURN v_global_enabled;
  END IF;
  
  -- Check expiration
  IF v_expires_at IS NOT NULL AND v_expires_at < NOW() THEN
    RETURN FALSE;
  END IF;
  
  RETURN v_tenant_enabled;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to log feature usage
CREATE OR REPLACE FUNCTION log_feature_usage(
  p_tenant_id UUID,
  p_feature_key VARCHAR,
  p_user_id UUID DEFAULT NULL,
  p_action VARCHAR DEFAULT 'access',
  p_metadata JSONB DEFAULT '{}'
) RETURNS VOID AS $$
BEGIN
  INSERT INTO feature_usage_logs (tenant_id, feature_key, user_id, action, metadata)
  VALUES (p_tenant_id, p_feature_key, p_user_id, p_action, p_metadata);
  
  -- Increment usage count
  UPDATE tenant_features
  SET usage_count = usage_count + 1
  WHERE tenant_id = p_tenant_id AND feature_key = p_feature_key;
END;
$$ LANGUAGE plpgsql;

-- Function to check usage limits
CREATE OR REPLACE FUNCTION check_feature_usage_limit(
  p_tenant_id UUID,
  p_feature_key VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
  v_usage_limit INTEGER;
  v_usage_count INTEGER;
BEGIN
  SELECT usage_limit, usage_count INTO v_usage_limit, v_usage_count
  FROM tenant_features
  WHERE tenant_id = p_tenant_id AND feature_key = p_feature_key;
  
  -- No limit set
  IF v_usage_limit IS NULL THEN
    RETURN TRUE;
  END IF;
  
  -- Check if under limit
  RETURN v_usage_count < v_usage_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- Triggers
-- ============================================================================

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_feature_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER global_features_updated_at
  BEFORE UPDATE ON global_features
  FOR EACH ROW
  EXECUTE FUNCTION update_feature_timestamp();

CREATE TRIGGER tenant_features_updated_at
  BEFORE UPDATE ON tenant_features
  FOR EACH ROW
  EXECUTE FUNCTION update_feature_timestamp();

-- Audit trail trigger
CREATE OR REPLACE FUNCTION log_feature_change()
RETURNS TRIGGER AS $$
DECLARE
  v_action VARCHAR;
  v_changed_by UUID;
BEGIN
  -- Determine action
  IF TG_OP = 'INSERT' THEN
    v_action = 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.enabled != NEW.enabled THEN
      v_action = CASE WHEN NEW.enabled THEN 'enabled' ELSE 'disabled' END;
    ELSE
      v_action = 'config_updated';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_action = 'deleted';
  END IF;
  
  -- Get current user from session if available
  -- v_changed_by = current_setting('app.current_user_id', true)::UUID;
  
  -- Log to audit table
  IF TG_OP = 'DELETE' THEN
    INSERT INTO feature_audit_log (feature_key, action, old_value, changed_by)
    VALUES (OLD.feature_key, v_action, row_to_json(OLD), v_changed_by);
    RETURN OLD;
  ELSE
    INSERT INTO feature_audit_log (feature_key, action, old_value, new_value, changed_by)
    VALUES (
      NEW.feature_key,
      v_action,
      CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END,
      row_to_json(NEW),
      v_changed_by
    );
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER global_features_audit
  AFTER INSERT OR UPDATE OR DELETE ON global_features
  FOR EACH ROW
  EXECUTE FUNCTION log_feature_change();

CREATE TRIGGER tenant_features_audit
  AFTER INSERT OR UPDATE OR DELETE ON tenant_features
  FOR EACH ROW
  EXECUTE FUNCTION log_feature_change();

-- ============================================================================
-- Default Features (All Platform Features)
-- ============================================================================

INSERT INTO global_features (feature_key, feature_name, feature_category, description, enabled, config) VALUES

-- AI Features
('ai-video-search', 'AI Video Search', 'ai', 'Natural language video search with semantic understanding', true, '{"requires_openai": true}'),
('guardian-ai-assistant', 'Guardian AI Assistant', 'ai', 'JARVIS-like AI security assistant', true, '{"requires_openai": true, "requires_gpt4": true}'),
('ai-incident-summary', 'AI Incident Summary', 'ai', 'Automatic incident report generation', true, '{"requires_openai": true}'),
('ai-evidence-builder', 'AI Evidence Builder', 'ai', 'Intelligent evidence collection and organization', true, '{}'),
('ai-prediction', 'AI Prediction Engine', 'ai', 'Predictive analytics for incidents and failures', false, '{"experimental": true}'),
('ai-root-cause-analysis', 'AI Root Cause Analysis', 'ai', 'Automated incident root cause identification', true, '{}'),

-- Analytics Features
('behavioral-analytics', 'Behavioral Analytics', 'analytics', 'Advanced behavior pattern detection', true, '{}'),
('journey-tracking', 'Journey Tracking', 'analytics', 'Cross-camera person/vehicle journey reconstruction', true, '{}'),
('time-machine-investigation', 'Time Machine Investigation', 'analytics', 'Timeline-based forensic investigation', true, '{}'),
('crowd-analytics', 'Crowd Analytics', 'analytics', 'Crowd density, flow, and heatmap analysis', true, '{}'),
('retail-analytics', 'Retail Analytics', 'analytics', 'Footfall, conversion, queue, shelf monitoring', true, '{}'),
('parking-analytics', 'Parking Analytics', 'analytics', 'Parking occupancy and violation detection', true, '{}'),

-- Face Recognition (Consent-aware)
('face-recognition', 'Face Recognition', 'biometric', 'Face recognition with consent controls', false, '{"requires_consent": true, "gdpr_compliant": true}'),
('watchlist-management', 'Watchlist Management', 'biometric', 'Manage face recognition watchlists', false, '{"requires_consent": true}'),
('vip-detection', 'VIP Detection', 'biometric', 'Automatic VIP identification', false, '{"requires_consent": true}'),

-- Vehicle Features
('anpr', 'ANPR (License Plate Recognition)', 'vehicle', 'Automatic Number Plate Recognition', true, '{}'),
('vehicle-reidentification', 'Vehicle Re-identification', 'vehicle', 'Cross-camera vehicle tracking', true, '{}'),
('speed-estimation', 'Speed Estimation', 'vehicle', 'Vehicle speed detection', true, '{}'),

-- Safety & Security
('fire-smoke-detection', 'Fire & Smoke Detection', 'safety', 'Real-time fire and smoke detection', true, '{"priority": "P1"}'),
('ppe-compliance', 'PPE Compliance', 'safety', 'Safety gear compliance monitoring', true, '{}'),
('intrusion-detection', 'Intrusion Detection', 'security', 'Perimeter and area intrusion alerts', true, '{}'),
('weapon-detection', 'Weapon Detection', 'security', 'Automatic weapon identification', true, '{"priority": "P1"}'),
('tailgating-detection', 'Tailgating Detection', 'security', 'Unauthorized access detection', true, '{}'),

-- Banking & BFSI
('vault-monitoring', 'Vault Monitoring', 'banking', 'After-hours vault activity detection', true, '{"priority": "P1"}'),
('dual-control-verification', 'Dual Control Verification', 'banking', 'Two-person rule enforcement', true, '{"priority": "P1"}'),
('atm-security', 'ATM Security', 'banking', 'ATM tampering and skimming detection', true, '{}'),
('cash-counter-monitoring', 'Cash Counter Monitoring', 'banking', 'Teller and cash handling monitoring', true, '{}'),

-- Industrial
('forklift-safety', 'Forklift Safety', 'industrial', 'Forklift operation and proximity alerts', true, '{}'),
('machine-zone-monitoring', 'Machine Zone Monitoring', 'industrial', 'Hazardous machine area monitoring', true, '{}'),
('fall-from-height', 'Fall from Height Detection', 'industrial', 'Worker fall detection', true, '{"priority": "P1"}'),

-- Smart City
('traffic-analytics', 'Traffic Analytics', 'smart-city', 'Traffic flow, congestion, violation detection', true, '{}'),
('accident-detection', 'Accident Detection', 'smart-city', 'Automatic accident identification', true, '{"priority": "P1"}'),
('illegal-dumping', 'Illegal Dumping Detection', 'smart-city', 'Unauthorized waste disposal detection', true, '{}'),

-- Camera Health
('camera-health-monitoring', 'Camera Health Monitoring', 'system', 'AI-powered camera quality monitoring', true, '{}'),
('predictive-maintenance', 'Predictive Maintenance', 'system', 'Predict hardware failures before they happen', true, '{}'),

-- Advanced Features
('multi-tenant-isolation', 'Multi-Tenant Isolation', 'enterprise', 'Complete tenant data isolation', true, '{}'),
('sso-integration', 'SSO Integration', 'enterprise', 'SAML/OAuth SSO support', true, '{}'),
('custom-branding', 'Custom Branding', 'enterprise', 'White-label customization', false, '{}'),
('api-access', 'API Access', 'enterprise', 'RESTful API for integrations', true, '{}'),
('webhook-notifications', 'Webhook Notifications', 'enterprise', 'Real-time webhook alerts', true, '{}'),
('advanced-reporting', 'Advanced Reporting', 'enterprise', 'Custom reports and dashboards', true, '{}'),

-- Edge Computing
('edge-ai-processing', 'Edge AI Processing', 'edge', 'On-device AI inference', true, '{}'),
('edge-auto-discovery', 'Edge Auto-Discovery', 'edge', 'Automatic edge agent discovery', true, '{}'),
('edge-fleet-management', 'Edge Fleet Management', 'edge', 'Centralized edge device management', true, '{}'),

-- Experimental
('digital-twin', 'Digital Twin', 'experimental', '3D facility visualization and simulation', false, '{"experimental": true}'),
('voice-commands', 'Voice Commands', 'experimental', 'Voice-controlled operations', false, '{"experimental": true}'),
('ar-investigation', 'AR Investigation', 'experimental', 'Augmented reality forensics', false, '{"experimental": true}')

ON CONFLICT (feature_key) DO NOTHING;

-- ============================================================================
-- Views for Easy Querying
-- ============================================================================

-- View: Feature status per tenant
CREATE OR REPLACE VIEW v_tenant_feature_status AS
SELECT 
  t.id as tenant_id,
  t.name as tenant_name,
  gf.feature_key,
  gf.feature_name,
  gf.feature_category,
  gf.enabled as global_enabled,
  tf.enabled as tenant_enabled,
  COALESCE(tf.enabled, gf.enabled) as effective_enabled,
  tf.usage_count,
  tf.usage_limit,
  tf.expires_at,
  CASE 
    WHEN tf.expires_at IS NOT NULL AND tf.expires_at < NOW() THEN true
    ELSE false
  END as is_expired,
  gf.config as global_config,
  tf.config as tenant_config
FROM tenants t
CROSS JOIN global_features gf
LEFT JOIN tenant_features tf ON t.id = tf.tenant_id AND gf.feature_key = tf.feature_key;

-- View: Feature usage summary
CREATE OR REPLACE VIEW v_feature_usage_summary AS
SELECT 
  feature_key,
  COUNT(*) as total_usage,
  COUNT(DISTINCT tenant_id) as unique_tenants,
  COUNT(DISTINCT user_id) as unique_users,
  MIN(created_at) as first_used,
  MAX(created_at) as last_used
FROM feature_usage_logs
GROUP BY feature_key;

COMMENT ON TABLE global_features IS 'Platform-wide feature flags';
COMMENT ON TABLE tenant_features IS 'Per-tenant feature overrides and limits';
COMMENT ON TABLE feature_usage_logs IS 'Feature usage tracking for analytics and billing';
COMMENT ON TABLE feature_audit_log IS 'Audit trail for all feature configuration changes';
COMMENT ON FUNCTION is_feature_enabled IS 'Check if a feature is enabled for a specific tenant';
COMMENT ON FUNCTION log_feature_usage IS 'Log feature usage and increment usage counter';
