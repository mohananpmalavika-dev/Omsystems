-- Guardian Network Production Schema
-- PostgreSQL 12+ compatible
-- Uses schema namespace to avoid conflicts

-- Create schema
CREATE SCHEMA IF NOT EXISTS guardian_network;

-- Set search path
SET search_path TO guardian_network, public;

-- ============================================================================
-- Deployments Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS guardian_network.deployments (
  id VARCHAR(50) PRIMARY KEY,
  industry_vertical VARCHAR(50) NOT NULL,
  geographic_region VARCHAR(100),
  urban_density VARCHAR(20),
  
  first_connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  
  patterns_contributed INTEGER NOT NULL DEFAULT 0,
  patterns_received INTEGER NOT NULL DEFAULT 0,
  usefulness_score DECIMAL(3, 2) DEFAULT 0.00 CHECK (usefulness_score >= 0 AND usefulness_score <= 1),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deployments_industry ON guardian_network.deployments(industry_vertical);
CREATE INDEX IF NOT EXISTS idx_deployments_region ON guardian_network.deployments(geographic_region);
CREATE INDEX IF NOT EXISTS idx_deployments_status ON guardian_network.deployments(status);
CREATE INDEX IF NOT EXISTS idx_deployments_last_synced ON guardian_network.deployments(last_synced_at DESC);

-- ============================================================================
-- Threat Patterns Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS guardian_network.threat_patterns (
  id VARCHAR(50) PRIMARY KEY,
  
  -- Classification
  category VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  confidence VARCHAR(20) NOT NULL CHECK (confidence IN ('confirmed', 'probable', 'possible', 'suspected')),
  
  -- Temporal (anonymized to buckets)
  occurred_at TIMESTAMPTZ NOT NULL,
  time_of_day VARCHAR(20) NOT NULL CHECK (time_of_day IN ('morning', 'afternoon', 'evening', 'night')),
  day_of_week VARCHAR(20) NOT NULL,
  
  -- Location (fully anonymized)
  industry_vertical VARCHAR(50) NOT NULL,
  location_category VARCHAR(50) NOT NULL,
  geographic_region VARCHAR(100),
  urban_density VARCHAR(20),
  
  -- Behavioral signature (JSONB for flexibility and indexing)
  behavioral_signature JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Detection metadata
  detection_methods TEXT[] NOT NULL DEFAULT '{}'::text[],
  ai_capabilities TEXT[] NOT NULL DEFAULT '{}'::text[],
  
  -- Outcome
  outcome VARCHAR(30) NOT NULL CHECK (outcome IN ('prevented', 'detected-during', 'detected-after', 'unknown')),
  response_time INTEGER,
  
  -- Provenance (anonymized)
  contributing_deployment_id VARCHAR(50) NOT NULL,
  shared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verification_status VARCHAR(20) NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('verified', 'unverified', 'disputed')),
  
  -- Usage tracking
  match_count INTEGER NOT NULL DEFAULT 0,
  last_matched_at TIMESTAMPTZ,
  
  -- Cross-pattern correlation
  related_pattern_ids TEXT[],
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Foreign key
  CONSTRAINT fk_contributing_deployment 
    FOREIGN KEY (contributing_deployment_id) 
    REFERENCES guardian_network.deployments(id) 
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_patterns_category ON guardian_network.threat_patterns(category);
CREATE INDEX IF NOT EXISTS idx_patterns_severity ON guardian_network.threat_patterns(severity);
CREATE INDEX IF NOT EXISTS idx_patterns_industry ON guardian_network.threat_patterns(industry_vertical);
CREATE INDEX IF NOT EXISTS idx_patterns_occurred_at ON guardian_network.threat_patterns(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_contributing_deployment ON guardian_network.threat_patterns(contributing_deployment_id);
CREATE INDEX IF NOT EXISTS idx_patterns_verification ON guardian_network.threat_patterns(verification_status);
CREATE INDEX IF NOT EXISTS idx_patterns_match_count ON guardian_network.threat_patterns(match_count DESC);

-- GIN index for JSONB behavioral signature
CREATE INDEX IF NOT EXISTS idx_patterns_behavioral_signature ON guardian_network.threat_patterns USING GIN(behavioral_signature);

-- GIN index for array columns
CREATE INDEX IF NOT EXISTS idx_patterns_detection_methods ON guardian_network.threat_patterns USING GIN(detection_methods);
CREATE INDEX IF NOT EXISTS idx_patterns_ai_capabilities ON guardian_network.threat_patterns USING GIN(ai_capabilities);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_patterns_category_industry_occurred ON guardian_network.threat_patterns(category, industry_vertical, occurred_at DESC);

-- ============================================================================
-- Pattern Matches Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS guardian_network.pattern_matches (
  id BIGSERIAL PRIMARY KEY,
  
  deployment_id VARCHAR(50) NOT NULL,
  pattern_id VARCHAR(50) NOT NULL,
  local_incident_id VARCHAR(100) NOT NULL,
  
  similarity_score DECIMAL(4, 3) NOT NULL CHECK (similarity_score >= 0 AND similarity_score <= 1),
  matched_attributes TEXT[] NOT NULL DEFAULT '{}'::text[],
  confidence VARCHAR(20) NOT NULL,
  
  -- Actions taken
  recommended_actions JSONB,
  actions_applied TEXT[],
  prevented BOOLEAN DEFAULT FALSE,
  
  matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Foreign keys
  CONSTRAINT fk_match_deployment 
    FOREIGN KEY (deployment_id) 
    REFERENCES guardian_network.deployments(id) 
    ON DELETE CASCADE,
  CONSTRAINT fk_match_pattern 
    FOREIGN KEY (pattern_id) 
    REFERENCES guardian_network.threat_patterns(id) 
    ON DELETE CASCADE,
  
  -- Unique constraint
  CONSTRAINT uq_deployment_incident_pattern 
    UNIQUE(deployment_id, local_incident_id, pattern_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_deployment ON guardian_network.pattern_matches(deployment_id);
CREATE INDEX IF NOT EXISTS idx_matches_pattern ON guardian_network.pattern_matches(pattern_id);
CREATE INDEX IF NOT EXISTS idx_matches_similarity ON guardian_network.pattern_matches(similarity_score DESC);
CREATE INDEX IF NOT EXISTS idx_matches_prevented ON guardian_network.pattern_matches(prevented) WHERE prevented = TRUE;
CREATE INDEX IF NOT EXISTS idx_matches_matched_at ON guardian_network.pattern_matches(matched_at DESC);

-- ============================================================================
-- Sync Status Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS guardian_network.sync_status (
  deployment_id VARCHAR(50) PRIMARY KEY,
  
  last_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_status VARCHAR(20) NOT NULL DEFAULT 'healthy' CHECK (sync_status IN ('healthy', 'degraded', 'offline')),
  pending_uploads INTEGER DEFAULT 0,
  pending_downloads INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Foreign key
  CONSTRAINT fk_sync_deployment 
    FOREIGN KEY (deployment_id) 
    REFERENCES guardian_network.deployments(id) 
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sync_status_last_sync ON guardian_network.sync_status(last_sync_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_status_status ON guardian_network.sync_status(sync_status);

-- ============================================================================
-- Audit Log Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS guardian_network.audit_log (
  id BIGSERIAL PRIMARY KEY,
  
  deployment_id VARCHAR(50) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50),
  entity_id VARCHAR(50),
  
  metadata JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Foreign key
  CONSTRAINT fk_audit_deployment 
    FOREIGN KEY (deployment_id) 
    REFERENCES guardian_network.deployments(id) 
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_audit_deployment ON guardian_network.audit_log(deployment_id);
CREATE INDEX IF NOT EXISTS idx_audit_event_type ON guardian_network.audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON guardian_network.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON guardian_network.audit_log(entity_type, entity_id);

-- Partition audit log by month for better performance
-- Note: This requires PostgreSQL 10+
-- ALTER TABLE guardian_network.audit_log PARTITION BY RANGE (created_at);

-- ============================================================================
-- Benchmark Metrics Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS guardian_network.benchmark_metrics (
  id BIGSERIAL PRIMARY KEY,
  
  deployment_id VARCHAR(50) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Your metrics
  incident_count INTEGER NOT NULL,
  prevention_rate DECIMAL(4, 3) NOT NULL CHECK (prevention_rate >= 0 AND prevention_rate <= 1),
  detection_rate DECIMAL(4, 3) NOT NULL CHECK (detection_rate >= 0 AND detection_rate <= 1),
  avg_response_time INTEGER NOT NULL,
  false_positive_rate DECIMAL(4, 3) NOT NULL CHECK (false_positive_rate >= 0 AND false_positive_rate <= 1),
  
  -- By category (JSONB for flexibility)
  by_category JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Percentile rankings (0-100)
  overall_percentile INTEGER NOT NULL CHECK (overall_percentile >= 0 AND overall_percentile <= 100),
  prevention_percentile INTEGER NOT NULL CHECK (prevention_percentile >= 0 AND prevention_percentile <= 100),
  detection_percentile INTEGER NOT NULL CHECK (detection_percentile >= 0 AND detection_percentile <= 100),
  response_time_percentile INTEGER NOT NULL CHECK (response_time_percentile >= 0 AND response_time_percentile <= 100),
  ai_effectiveness_percentile INTEGER NOT NULL CHECK (ai_effectiveness_percentile >= 0 AND ai_effectiveness_percentile <= 100),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Foreign key
  CONSTRAINT fk_benchmark_deployment 
    FOREIGN KEY (deployment_id) 
    REFERENCES guardian_network.deployments(id) 
    ON DELETE CASCADE,
  
  -- Unique constraint
  CONSTRAINT uq_deployment_period 
    UNIQUE(deployment_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_benchmark_deployment ON guardian_network.benchmark_metrics(deployment_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_period ON guardian_network.benchmark_metrics(period_start DESC, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_benchmark_overall_percentile ON guardian_network.benchmark_metrics(overall_percentile DESC);

-- ============================================================================
-- Threat Alerts Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS guardian_network.threat_alerts (
  id VARCHAR(50) PRIMARY KEY,
  
  alert_level VARCHAR(20) NOT NULL CHECK (alert_level IN ('critical', 'high', 'medium')),
  
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  
  -- Threat details (JSONB)
  threat_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Scope
  industries TEXT[] NOT NULL DEFAULT '{}'::text[],
  regions TEXT[],
  location_types TEXT[],
  
  -- Indicators (JSONB)
  indicators JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Recommended actions (JSONB)
  actions JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Detection guidance (JSONB)
  detection_guidance JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  
  acknowledgment_required BOOLEAN DEFAULT FALSE,
  acknowledgment_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_threat_alerts_level ON guardian_network.threat_alerts(alert_level);
CREATE INDEX IF NOT EXISTS idx_threat_alerts_issued_at ON guardian_network.threat_alerts(issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_threat_alerts_industries ON guardian_network.threat_alerts USING GIN(industries);
CREATE INDEX IF NOT EXISTS idx_threat_alerts_expires_at ON guardian_network.threat_alerts(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threat_alerts_active ON guardian_network.threat_alerts(issued_at DESC) WHERE (expires_at IS NULL OR expires_at > NOW());

-- ============================================================================
-- Threat Alert Acknowledgments Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS guardian_network.threat_alert_acknowledgments (
  id BIGSERIAL PRIMARY KEY,
  
  alert_id VARCHAR(50) NOT NULL,
  deployment_id VARCHAR(50) NOT NULL,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Foreign keys
  CONSTRAINT fk_threat_ack_alert 
    FOREIGN KEY (alert_id) 
    REFERENCES guardian_network.threat_alerts(id) 
    ON DELETE CASCADE,
  CONSTRAINT fk_threat_ack_deployment 
    FOREIGN KEY (deployment_id) 
    REFERENCES guardian_network.deployments(id) 
    ON DELETE CASCADE,
  
  -- Unique constraint
  CONSTRAINT uq_alert_deployment 
    UNIQUE(alert_id, deployment_id)
);

CREATE INDEX IF NOT EXISTS idx_threat_ack_alert ON guardian_network.threat_alert_acknowledgments(alert_id);
CREATE INDEX IF NOT EXISTS idx_threat_ack_deployment ON guardian_network.threat_alert_acknowledgments(deployment_id);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION guardian_network.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_deployments_updated_at BEFORE UPDATE ON guardian_network.deployments
  FOR EACH ROW EXECUTE FUNCTION guardian_network.update_updated_at_column();

CREATE TRIGGER update_patterns_updated_at BEFORE UPDATE ON guardian_network.threat_patterns
  FOR EACH ROW EXECUTE FUNCTION guardian_network.update_updated_at_column();

CREATE TRIGGER update_sync_status_updated_at BEFORE UPDATE ON guardian_network.sync_status
  FOR EACH ROW EXECUTE FUNCTION guardian_network.update_updated_at_column();

-- ============================================================================
-- Views
-- ============================================================================

-- Recent patterns view (last 90 days)
CREATE OR REPLACE VIEW guardian_network.recent_patterns AS
SELECT 
  p.*,
  d.industry_vertical as deployment_industry,
  d.geographic_region as deployment_region
FROM guardian_network.threat_patterns p
JOIN guardian_network.deployments d ON p.contributing_deployment_id = d.id
WHERE p.occurred_at >= NOW() - INTERVAL '90 days'
ORDER BY p.occurred_at DESC;

-- Active deployments view
CREATE OR REPLACE VIEW guardian_network.active_deployments AS
SELECT 
  d.*,
  s.sync_status,
  s.last_sync_at
FROM guardian_network.deployments d
LEFT JOIN guardian_network.sync_status s ON d.id = s.deployment_id
WHERE d.status = 'active'
  AND d.last_synced_at >= NOW() - INTERVAL '7 days'
ORDER BY d.last_synced_at DESC;

-- ============================================================================
-- Functions
-- ============================================================================

-- Get deployment statistics
CREATE OR REPLACE FUNCTION guardian_network.get_deployment_stats(p_deployment_id VARCHAR)
RETURNS TABLE (
  patterns_shared INTEGER,
  patterns_received INTEGER,
  local_matches BIGINT,
  prevented_incidents BIGINT,
  usefulness_score DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.patterns_contributed,
    d.patterns_received,
    COUNT(DISTINCT pm.id),
    SUM(CASE WHEN pm.prevented THEN 1 ELSE 0 END),
    d.usefulness_score
  FROM guardian_network.deployments d
  LEFT JOIN guardian_network.pattern_matches pm ON d.id = pm.deployment_id
  WHERE d.id = p_deployment_id
  GROUP BY d.id, d.patterns_contributed, d.patterns_received, d.usefulness_score;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Grants
-- ============================================================================

-- Grant usage on schema
GRANT USAGE ON SCHEMA guardian_network TO PUBLIC;

-- Grant select on all tables to read-only role (create if needed)
-- CREATE ROLE guardian_network_readonly;
-- GRANT SELECT ON ALL TABLES IN SCHEMA guardian_network TO guardian_network_readonly;

-- Grant all privileges to application role (create if needed)
-- CREATE ROLE guardian_network_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA guardian_network TO guardian_network_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA guardian_network TO guardian_network_app;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON SCHEMA guardian_network IS 'Guardian Network cross-location threat intelligence system';
COMMENT ON TABLE guardian_network.deployments IS 'Anonymized deployment registry';
COMMENT ON TABLE guardian_network.threat_patterns IS 'Privacy-preserved threat patterns from all deployments';
COMMENT ON TABLE guardian_network.pattern_matches IS 'Pattern match tracking for each deployment';
COMMENT ON TABLE guardian_network.sync_status IS 'Network synchronization status per deployment';
COMMENT ON TABLE guardian_network.audit_log IS 'Complete audit trail of all network operations';
COMMENT ON TABLE guardian_network.benchmark_metrics IS 'Performance benchmarking data';
COMMENT ON TABLE guardian_network.threat_alerts IS 'Real-time threat alerts distributed to deployments';

-- ============================================================================
-- Sample Data (for testing only - remove in production)
-- ============================================================================

-- Uncomment to insert sample data for testing:
/*
INSERT INTO guardian_network.deployments (id, industry_vertical, geographic_region, urban_density)
VALUES ('deployment-test001', 'banking', 'North America', 'urban')
ON CONFLICT (id) DO NOTHING;

INSERT INTO guardian_network.threat_patterns (
  id, category, severity, confidence,
  occurred_at, time_of_day, day_of_week,
  industry_vertical, location_category, geographic_region,
  behavioral_signature, detection_methods, ai_capabilities,
  outcome, response_time, contributing_deployment_id
)
VALUES (
  'pattern-test001',
  'theft',
  'high',
  'confirmed',
  NOW() - INTERVAL '7 days',
  'night',
  'friday',
  'banking',
  'branch',
  'North America',
  '{"approachPattern": "loitered-30s-then-acted", "targetType": "ATM", "toolsUsed": ["crowbar"]}'::jsonb,
  ARRAY['motion-detection', 'AI-analytics'],
  ARRAY['atm-tampering', 'object-detection'],
  'prevented',
  120,
  'deployment-test001'
)
ON CONFLICT (id) DO NOTHING;
*/

-- ============================================================================
-- Vacuum and Analyze
-- ============================================================================

VACUUM ANALYZE guardian_network.deployments;
VACUUM ANALYZE guardian_network.threat_patterns;
VACUUM ANALYZE guardian_network.pattern_matches;
VACUUM ANALYZE guardian_network.audit_log;

-- Done
SELECT 'Guardian Network schema created successfully!' as status;
