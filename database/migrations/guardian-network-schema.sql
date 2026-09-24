-- Guardian Network Database Schema
-- Central hub for cross-location threat intelligence

-- ============================================================================
-- Deployments Table
-- Tracks all participating deployments (anonymized)
-- ============================================================================

CREATE TABLE IF NOT EXISTS deployments (
  id VARCHAR(50) PRIMARY KEY, -- anonymized deployment ID
  industry_vertical VARCHAR(50) NOT NULL,
  geographic_region VARCHAR(100),
  urban_density VARCHAR(20),
  first_connected_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMP NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, inactive, suspended
  patterns_contributed INTEGER NOT NULL DEFAULT 0,
  patterns_received INTEGER NOT NULL DEFAULT 0,
  usefulness_score DECIMAL(3, 2) DEFAULT 0.00, -- 0-1 score
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deployments_industry ON deployments(industry_vertical);
CREATE INDEX idx_deployments_region ON deployments(geographic_region);
CREATE INDEX idx_deployments_status ON deployments(status);

-- ============================================================================
-- Threat Patterns Table
-- Central repository of anonymized threat patterns
-- ============================================================================

CREATE TABLE IF NOT EXISTS threat_patterns (
  id VARCHAR(50) PRIMARY KEY,
  category VARCHAR(50) NOT NULL, -- theft, fraud, intrusion, etc.
  severity VARCHAR(20) NOT NULL, -- critical, high, medium, low
  confidence VARCHAR(20) NOT NULL, -- confirmed, probable, possible, suspected
  
  -- Temporal (anonymized to buckets)
  occurred_at TIMESTAMP NOT NULL,
  time_of_day VARCHAR(20) NOT NULL, -- morning, afternoon, evening, night
  day_of_week VARCHAR(20) NOT NULL,
  
  -- Location (fully anonymized)
  industry_vertical VARCHAR(50) NOT NULL,
  location_category VARCHAR(50) NOT NULL, -- branch, headquarters, warehouse, etc.
  geographic_region VARCHAR(100),
  urban_density VARCHAR(20),
  
  -- Behavioral signature (JSON for flexibility)
  behavioral_signature JSONB NOT NULL,
  
  -- Detection metadata
  detection_methods TEXT[] NOT NULL,
  ai_capabilities TEXT[] NOT NULL,
  
  -- Outcome
  outcome VARCHAR(30) NOT NULL, -- prevented, detected-during, detected-after, unknown
  response_time INTEGER, -- seconds
  
  -- Provenance
  contributing_deployment_id VARCHAR(50) NOT NULL REFERENCES deployments(id),
  shared_at TIMESTAMP NOT NULL DEFAULT NOW(),
  verification_status VARCHAR(20) NOT NULL DEFAULT 'unverified', -- verified, unverified, disputed
  
  -- Usage tracking
  match_count INTEGER NOT NULL DEFAULT 0,
  last_matched_at TIMESTAMP,
  
  -- Cross-pattern correlation
  related_pattern_ids TEXT[],
  
  -- Metadata
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_patterns_category ON threat_patterns(category);
CREATE INDEX idx_patterns_severity ON threat_patterns(severity);
CREATE INDEX idx_patterns_industry ON threat_patterns(industry_vertical);
CREATE INDEX idx_patterns_occurred_at ON threat_patterns(occurred_at DESC);
CREATE INDEX idx_patterns_contributing_deployment ON threat_patterns(contributing_deployment_id);
CREATE INDEX idx_patterns_verification ON threat_patterns(verification_status);
CREATE INDEX idx_patterns_behavioral_signature ON threat_patterns USING GIN(behavioral_signature);
CREATE INDEX idx_patterns_detection_methods ON threat_patterns USING GIN(detection_methods);

-- ============================================================================
-- Pattern Matches Table
-- Tracks when deployments match patterns
-- ============================================================================

CREATE TABLE IF NOT EXISTS pattern_matches (
  id BIGSERIAL PRIMARY KEY,
  deployment_id VARCHAR(50) NOT NULL REFERENCES deployments(id),
  pattern_id VARCHAR(50) NOT NULL REFERENCES threat_patterns(id),
  local_incident_id VARCHAR(100) NOT NULL, -- deployment's internal incident ID (anonymized)
  
  similarity_score DECIMAL(4, 3) NOT NULL, -- 0-1
  matched_attributes TEXT[] NOT NULL,
  confidence VARCHAR(20) NOT NULL,
  
  -- Actions taken
  recommended_actions JSONB,
  actions_applied TEXT[],
  prevented BOOLEAN DEFAULT FALSE,
  
  matched_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(deployment_id, local_incident_id, pattern_id)
);

CREATE INDEX idx_matches_deployment ON pattern_matches(deployment_id);
CREATE INDEX idx_matches_pattern ON pattern_matches(pattern_id);
CREATE INDEX idx_matches_similarity ON pattern_matches(similarity_score DESC);
CREATE INDEX idx_matches_prevented ON pattern_matches(prevented) WHERE prevented = TRUE;
CREATE INDEX idx_matches_matched_at ON pattern_matches(matched_at DESC);

-- ============================================================================
-- Intelligence Updates Table
-- Real-time threat intelligence updates
-- ============================================================================

CREATE TABLE IF NOT EXISTS intelligence_updates (
  id VARCHAR(50) PRIMARY KEY,
  type VARCHAR(30) NOT NULL, -- new-pattern, pattern-update, emerging-threat, tactical-alert
  priority VARCHAR(20) NOT NULL, -- urgent, high, normal
  
  title VARCHAR(255) NOT NULL,
  summary TEXT NOT NULL,
  
  -- Associated patterns
  pattern_ids TEXT[] NOT NULL,
  
  -- Geographic scope
  affected_regions TEXT[],
  affected_verticals TEXT[],
  
  -- Tactical information
  indicators TEXT[] NOT NULL,
  recommendations TEXT[] NOT NULL,
  
  -- Timing
  published_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP,
  
  -- Tracking
  affected_deployments INTEGER DEFAULT 0,
  acknowledgment_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_intel_updates_type ON intelligence_updates(type);
CREATE INDEX idx_intel_updates_priority ON intelligence_updates(priority);
CREATE INDEX idx_intel_updates_published_at ON intelligence_updates(published_at DESC);
CREATE INDEX idx_intel_updates_verticals ON intelligence_updates USING GIN(affected_verticals);
CREATE INDEX idx_intel_updates_expires_at ON intelligence_updates(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================================================
-- Intelligence Acknowledgments Table
-- Track which deployments have acknowledged updates
-- ============================================================================

CREATE TABLE IF NOT EXISTS intelligence_acknowledgments (
  id BIGSERIAL PRIMARY KEY,
  update_id VARCHAR(50) NOT NULL REFERENCES intelligence_updates(id),
  deployment_id VARCHAR(50) NOT NULL REFERENCES deployments(id),
  acknowledged_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(update_id, deployment_id)
);

CREATE INDEX idx_ack_update ON intelligence_acknowledgments(update_id);
CREATE INDEX idx_ack_deployment ON intelligence_acknowledgments(deployment_id);

-- ============================================================================
-- Benchmark Metrics Table
-- Historical benchmark data for each deployment
-- ============================================================================

CREATE TABLE IF NOT EXISTS benchmark_metrics (
  id BIGSERIAL PRIMARY KEY,
  deployment_id VARCHAR(50) NOT NULL REFERENCES deployments(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Your metrics
  incident_count INTEGER NOT NULL,
  prevention_rate DECIMAL(4, 3) NOT NULL,
  detection_rate DECIMAL(4, 3) NOT NULL,
  avg_response_time INTEGER NOT NULL,
  false_positive_rate DECIMAL(4, 3) NOT NULL,
  
  -- By category (JSONB for flexibility)
  by_category JSONB NOT NULL,
  
  -- Percentile rankings
  overall_percentile INTEGER NOT NULL, -- 0-100
  prevention_percentile INTEGER NOT NULL,
  detection_percentile INTEGER NOT NULL,
  response_time_percentile INTEGER NOT NULL,
  ai_effectiveness_percentile INTEGER NOT NULL,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(deployment_id, period_start, period_end)
);

CREATE INDEX idx_benchmark_deployment ON benchmark_metrics(deployment_id);
CREATE INDEX idx_benchmark_period ON benchmark_metrics(period_start DESC, period_end DESC);
CREATE INDEX idx_benchmark_overall_percentile ON benchmark_metrics(overall_percentile DESC);

-- ============================================================================
-- Industry Statistics Table
-- Aggregated statistics per industry per period
-- ============================================================================

CREATE TABLE IF NOT EXISTS industry_statistics (
  id BIGSERIAL PRIMARY KEY,
  industry_vertical VARCHAR(50) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Aggregated metrics
  total_deployments INTEGER NOT NULL,
  total_incidents INTEGER NOT NULL,
  avg_prevention_rate DECIMAL(4, 3) NOT NULL,
  avg_detection_rate DECIMAL(4, 3) NOT NULL,
  avg_response_time INTEGER NOT NULL,
  avg_false_positive_rate DECIMAL(4, 3) NOT NULL,
  
  -- By category (JSONB)
  by_category JSONB NOT NULL,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(industry_vertical, period_start, period_end)
);

CREATE INDEX idx_industry_stats_vertical ON industry_statistics(industry_vertical);
CREATE INDEX idx_industry_stats_period ON industry_statistics(period_start DESC, period_end DESC);

-- ============================================================================
-- Industry Intelligence Reports Table
-- Monthly/quarterly intelligence reports
-- ============================================================================

CREATE TABLE IF NOT EXISTS intelligence_reports (
  id VARCHAR(50) PRIMARY KEY,
  report_type VARCHAR(30) NOT NULL, -- monthly, quarterly, tactical, strategic
  industry_vertical VARCHAR(50) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Threat landscape (JSONB for complex data)
  threat_landscape JSONB NOT NULL,
  
  -- Effectiveness data
  effectiveness JSONB NOT NULL,
  
  -- Strategic insights
  key_findings TEXT[] NOT NULL,
  recommendations TEXT[] NOT NULL,
  predicted_trends TEXT[] NOT NULL,
  
  -- Case studies (anonymized)
  case_studies JSONB,
  
  generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(industry_vertical, report_type, period_start, period_end)
);

CREATE INDEX idx_intel_reports_vertical ON intelligence_reports(industry_vertical);
CREATE INDEX idx_intel_reports_period ON intelligence_reports(period_start DESC, period_end DESC);
CREATE INDEX idx_intel_reports_type ON intelligence_reports(report_type);

-- ============================================================================
-- Real-time Threat Alerts Table
-- Critical alerts distributed to all deployments
-- ============================================================================

CREATE TABLE IF NOT EXISTS threat_alerts (
  id VARCHAR(50) PRIMARY KEY,
  alert_level VARCHAR(20) NOT NULL, -- critical, high, medium
  
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  
  -- Threat details (JSONB)
  threat_data JSONB NOT NULL,
  
  -- Scope
  industries TEXT[] NOT NULL,
  regions TEXT[],
  location_types TEXT[],
  
  -- Indicators
  indicators JSONB NOT NULL,
  
  -- Recommended actions
  actions JSONB NOT NULL,
  
  -- Detection guidance
  detection_guidance JSONB NOT NULL,
  
  issued_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP,
  
  acknowledgment_required BOOLEAN DEFAULT FALSE,
  acknowledgment_count INTEGER DEFAULT 0
);

CREATE INDEX idx_threat_alerts_level ON threat_alerts(alert_level);
CREATE INDEX idx_threat_alerts_issued_at ON threat_alerts(issued_at DESC);
CREATE INDEX idx_threat_alerts_industries ON threat_alerts USING GIN(industries);
CREATE INDEX idx_threat_alerts_expires_at ON threat_alerts(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================================================
-- Threat Alert Acknowledgments Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS threat_alert_acknowledgments (
  id BIGSERIAL PRIMARY KEY,
  alert_id VARCHAR(50) NOT NULL REFERENCES threat_alerts(id),
  deployment_id VARCHAR(50) NOT NULL REFERENCES deployments(id),
  acknowledged_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(alert_id, deployment_id)
);

CREATE INDEX idx_threat_ack_alert ON threat_alert_acknowledgments(alert_id);
CREATE INDEX idx_threat_ack_deployment ON threat_alert_acknowledgments(deployment_id);

-- ============================================================================
-- Sync Status Table
-- Track last sync time for each deployment
-- ============================================================================

CREATE TABLE IF NOT EXISTS sync_status (
  deployment_id VARCHAR(50) PRIMARY KEY REFERENCES deployments(id),
  last_sync_at TIMESTAMP NOT NULL DEFAULT NOW(),
  sync_status VARCHAR(20) NOT NULL DEFAULT 'healthy', -- healthy, degraded, offline
  pending_uploads INTEGER DEFAULT 0,
  pending_downloads INTEGER DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_status_last_sync ON sync_status(last_sync_at DESC);
CREATE INDEX idx_sync_status_status ON sync_status(sync_status);

-- ============================================================================
-- Audit Log Table
-- Track all pattern sharing, matches, and intelligence access
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  deployment_id VARCHAR(50) NOT NULL REFERENCES deployments(id),
  event_type VARCHAR(50) NOT NULL, -- pattern-shared, pattern-matched, intelligence-accessed, etc.
  entity_type VARCHAR(50), -- pattern, update, alert, etc.
  entity_id VARCHAR(50),
  
  metadata JSONB,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_deployment ON audit_log(deployment_id);
CREATE INDEX idx_audit_event_type ON audit_log(event_type);
CREATE INDEX idx_audit_created_at ON audit_log(created_at DESC);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);

-- ============================================================================
-- Materialized Views for Performance
-- ============================================================================

-- Top patterns by match count
CREATE MATERIALIZED VIEW IF NOT EXISTS top_patterns AS
SELECT 
  p.id,
  p.category,
  p.severity,
  p.industry_vertical,
  p.match_count,
  p.behavioral_signature,
  COUNT(DISTINCT pm.deployment_id) AS affected_deployments,
  SUM(CASE WHEN pm.prevented THEN 1 ELSE 0 END) AS prevented_count,
  p.last_matched_at
FROM threat_patterns p
LEFT JOIN pattern_matches pm ON p.id = pm.pattern_id
GROUP BY p.id
ORDER BY p.match_count DESC
LIMIT 1000;

CREATE UNIQUE INDEX idx_top_patterns_id ON top_patterns(id);

-- Deployment statistics summary
CREATE MATERIALIZED VIEW IF NOT EXISTS deployment_stats AS
SELECT 
  d.id,
  d.industry_vertical,
  d.patterns_contributed,
  d.patterns_received,
  d.usefulness_score,
  COUNT(DISTINCT pm.id) AS local_matches,
  SUM(CASE WHEN pm.prevented THEN 1 ELSE 0 END) AS prevented_incidents,
  AVG(pm.similarity_score) AS avg_similarity_score,
  d.last_synced_at
FROM deployments d
LEFT JOIN pattern_matches pm ON d.id = pm.deployment_id
GROUP BY d.id;

CREATE UNIQUE INDEX idx_deployment_stats_id ON deployment_stats(id);

-- Refresh these views periodically (every hour)
-- In production, set up a cron job or pg_cron extension:
-- SELECT cron.schedule('refresh_guardian_network_views', '0 * * * *', 
--   'REFRESH MATERIALIZED VIEW CONCURRENTLY top_patterns; 
--    REFRESH MATERIALIZED VIEW CONCURRENTLY deployment_stats;');

-- ============================================================================
-- Functions
-- ============================================================================

-- Update pattern match count when a new match is recorded
CREATE OR REPLACE FUNCTION update_pattern_match_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE threat_patterns
  SET 
    match_count = match_count + 1,
    last_matched_at = NEW.matched_at,
    updated_at = NOW()
  WHERE id = NEW.pattern_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_pattern_match_count
AFTER INSERT ON pattern_matches
FOR EACH ROW
EXECUTE FUNCTION update_pattern_match_count();

-- Update deployment stats when patterns are shared
CREATE OR REPLACE FUNCTION update_deployment_contribution()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE deployments
  SET 
    patterns_contributed = patterns_contributed + 1,
    last_synced_at = NOW(),
    updated_at = NOW()
  WHERE id = NEW.contributing_deployment_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_deployment_contribution
AFTER INSERT ON threat_patterns
FOR EACH ROW
EXECUTE FUNCTION update_deployment_contribution();

-- Update intelligence acknowledgment count
CREATE OR REPLACE FUNCTION update_intelligence_ack_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE intelligence_updates
  SET acknowledgment_count = acknowledgment_count + 1
  WHERE id = NEW.update_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_intelligence_ack_count
AFTER INSERT ON intelligence_acknowledgments
FOR EACH ROW
EXECUTE FUNCTION update_intelligence_ack_count();

-- ============================================================================
-- Sample Data (for testing)
-- ============================================================================

-- Insert sample deployment
INSERT INTO deployments (id, industry_vertical, geographic_region, urban_density)
VALUES ('deployment-sample001', 'banking', 'North America', 'urban')
ON CONFLICT (id) DO NOTHING;

-- Insert sample pattern
INSERT INTO threat_patterns (
  id, category, severity, confidence,
  occurred_at, time_of_day, day_of_week,
  industry_vertical, location_category, geographic_region,
  behavioral_signature, detection_methods, ai_capabilities,
  outcome, response_time, contributing_deployment_id
)
VALUES (
  'pattern-sample001',
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
  'deployment-sample001'
)
ON CONFLICT (id) DO NOTHING;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO guardian_network_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO guardian_network_api;
