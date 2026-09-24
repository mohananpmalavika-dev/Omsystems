/**
 * MindSense Emotional Intelligence Database Schema
 * 
 * Tables for:
 * - Emotional state tracking
 * - Micro-expression analysis
 * - Behavioral intent recognition
 * - Threat assessment
 * - De-escalation coaching
 * - Analytics and reporting
 */

-- =====================================================
-- Emotional States and Profiles
-- =====================================================

/**
 * Real-time emotional states
 * Stores current emotional analysis for each detected person
 */
CREATE TABLE IF NOT EXISTS mindsense_emotional_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  person_track_id VARCHAR(255) NOT NULL,
  
  -- Current emotion
  emotion VARCHAR(50) NOT NULL, -- happiness, sadness, anger, fear, surprise, disgust, neutral
  confidence DECIMAL(5,4) NOT NULL,
  valence DECIMAL(5,4) NOT NULL, -- -1 to 1 (negative to positive)
  arousal DECIMAL(5,4) NOT NULL, -- 0 to 1 (calm to excited)
  intensity DECIMAL(5,4) NOT NULL, -- 0 to 1
  
  -- Facial Action Units (FACS)
  action_units JSONB, -- { "AU1_innerBrowRaiser": 0.8, "AU12_lipCornerPuller": 0.9, ... }
  
  -- Stress indicators
  stress_score DECIMAL(5,4) NOT NULL DEFAULT 0,
  stress_indicators JSONB, -- { "facialTension": 0.6, "microExpressionRate": 2.5, ... }
  
  -- Deception indicators
  deception_score DECIMAL(5,4) NOT NULL DEFAULT 0,
  deception_indicators JSONB, -- { "microExpressionFrequency": 3, "emotionMismatch": true, ... }
  
  -- Micro-expressions detected
  micro_expressions JSONB, -- Recent micro-expressions array
  
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mindsense_emotional_states_camera ON mindsense_emotional_states(camera_id, timestamp DESC);
CREATE INDEX idx_mindsense_emotional_states_person ON mindsense_emotional_states(person_track_id, timestamp DESC);
CREATE INDEX idx_mindsense_emotional_states_emotion ON mindsense_emotional_states(emotion, timestamp DESC);
CREATE INDEX idx_mindsense_emotional_states_stress ON mindsense_emotional_states(stress_score DESC) WHERE stress_score > 0.6;
CREATE INDEX idx_mindsense_emotional_states_deception ON mindsense_emotional_states(deception_score DESC) WHERE deception_score > 0.6;
CREATE INDEX idx_mindsense_emotional_states_timestamp ON mindsense_emotional_states(timestamp DESC);

/**
 * Person emotional profiles
 * Aggregated emotional state over time for each tracked person
 */
CREATE TABLE IF NOT EXISTS mindsense_emotional_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  person_track_id VARCHAR(255) NOT NULL,
  person_id VARCHAR(255), -- If person is identified
  
  -- Current emotional state
  current_emotion VARCHAR(50) NOT NULL,
  emotion_confidence DECIMAL(5,4) NOT NULL,
  valence DECIMAL(5,4) NOT NULL,
  arousal DECIMAL(5,4) NOT NULL,
  intensity DECIMAL(5,4) NOT NULL,
  
  -- Aggregated indicators
  stress_indicators JSONB NOT NULL,
  deception_indicators JSONB NOT NULL,
  
  -- Statistics
  dominant_emotion VARCHAR(50) NOT NULL,
  emotion_distribution JSONB NOT NULL, -- { "anger": 5, "happiness": 12, ... }
  average_valence DECIMAL(5,4) NOT NULL,
  average_arousal DECIMAL(5,4) NOT NULL,
  emotional_stability DECIMAL(5,4) NOT NULL, -- 0-1, inverse of volatility
  
  -- Tracking
  first_seen TIMESTAMPTZ NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL,
  frame_count INTEGER NOT NULL DEFAULT 1,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mindsense_emotional_profiles_camera ON mindsense_emotional_profiles(camera_id, last_seen DESC);
CREATE INDEX idx_mindsense_emotional_profiles_person ON mindsense_emotional_profiles(person_track_id);
CREATE INDEX idx_mindsense_emotional_profiles_stability ON mindsense_emotional_profiles(emotional_stability);
CREATE UNIQUE INDEX idx_mindsense_emotional_profiles_unique ON mindsense_emotional_profiles(camera_id, person_track_id);

/**
 * Emotional timeline
 * Historical emotional state changes for analysis
 */
CREATE TABLE IF NOT EXISTS mindsense_emotional_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  person_track_id VARCHAR(255) NOT NULL,
  
  timestamp TIMESTAMPTZ NOT NULL,
  emotion VARCHAR(50) NOT NULL,
  confidence DECIMAL(5,4) NOT NULL,
  valence DECIMAL(5,4) NOT NULL,
  arousal DECIMAL(5,4) NOT NULL,
  intensity DECIMAL(5,4) NOT NULL,
  action_units JSONB,
  is_micro_expression BOOLEAN NOT NULL DEFAULT FALSE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mindsense_emotional_timeline_person ON mindsense_emotional_timeline(person_track_id, timestamp DESC);
CREATE INDEX idx_mindsense_emotional_timeline_micro ON mindsense_emotional_timeline(is_micro_expression, timestamp DESC) WHERE is_micro_expression = TRUE;

-- =====================================================
-- Micro-Expression Analysis
-- =====================================================

/**
 * Micro-expressions
 * Fleeting expressions (40-500ms) that reveal true emotions
 */
CREATE TABLE IF NOT EXISTS mindsense_micro_expressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  person_track_id VARCHAR(255) NOT NULL,
  
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration INTEGER NOT NULL, -- milliseconds
  
  emotion VARCHAR(50) NOT NULL,
  confidence DECIMAL(5,4) NOT NULL,
  masked_by VARCHAR(50), -- The macro emotion that followed
  is_genuine BOOLEAN NOT NULL, -- Not contradicted by macro expression
  
  action_units JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mindsense_micro_expressions_person ON mindsense_micro_expressions(person_track_id, start_time DESC);
CREATE INDEX idx_mindsense_micro_expressions_camera ON mindsense_micro_expressions(camera_id, start_time DESC);
CREATE INDEX idx_mindsense_micro_expressions_genuine ON mindsense_micro_expressions(is_genuine, start_time DESC) WHERE is_genuine = FALSE;

-- =====================================================
-- Behavioral Intent and Threat Assessment
-- =====================================================

/**
 * Threat assessments
 * Real-time behavioral intent recognition and threat scoring
 */
CREATE TABLE IF NOT EXISTS mindsense_threat_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  person_track_id VARCHAR(255) NOT NULL,
  
  -- Intent classification
  intent VARCHAR(50) NOT NULL, -- benign, nervous, suspicious, threatening, deceptive, distressed
  confidence DECIMAL(5,4) NOT NULL,
  
  -- Threat level
  threat_level VARCHAR(20) NOT NULL, -- none, low, medium, high, critical
  threat_score DECIMAL(5,4) NOT NULL, -- 0-1
  
  -- Behavioral indicators
  indicators JSONB NOT NULL, -- { "loiteringDuration": 180, "surveillanceBehavior": true, ... }
  
  -- Emotional context
  emotional_context JSONB NOT NULL, -- { "dominantEmotion": "anger", "stressLevel": 0.8, ... }
  
  -- Recommendations
  recommended_action TEXT NOT NULL,
  monitoring_priority VARCHAR(20) NOT NULL, -- low, medium, high, urgent
  alert_security BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Movement analysis
  trajectory JSONB, -- Array of {x, y, timestamp} points
  velocity DECIMAL(8,4),
  direction_changes INTEGER,
  dwell_duration INTEGER, -- seconds
  
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mindsense_threat_assessments_camera ON mindsense_threat_assessments(camera_id, timestamp DESC);
CREATE INDEX idx_mindsense_threat_assessments_person ON mindsense_threat_assessments(person_track_id, timestamp DESC);
CREATE INDEX idx_mindsense_threat_assessments_level ON mindsense_threat_assessments(threat_level, timestamp DESC);
CREATE INDEX idx_mindsense_threat_assessments_score ON mindsense_threat_assessments(threat_score DESC) WHERE threat_score > 0.6;
CREATE INDEX idx_mindsense_threat_assessments_intent ON mindsense_threat_assessments(intent, timestamp DESC);
CREATE INDEX idx_mindsense_threat_assessments_alert ON mindsense_threat_assessments(alert_security, timestamp DESC) WHERE alert_security = TRUE;

/**
 * Behavioral patterns
 * Aggregated behavioral analysis for persons of interest
 */
CREATE TABLE IF NOT EXISTS mindsense_behavioral_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  person_track_id VARCHAR(255) NOT NULL,
  person_id VARCHAR(255), -- If identified
  
  -- Pattern summary
  primary_intent VARCHAR(50) NOT NULL,
  intent_distribution JSONB NOT NULL, -- { "benign": 50, "nervous": 10, "suspicious": 5 }
  
  -- Threat history
  peak_threat_score DECIMAL(5,4) NOT NULL,
  average_threat_score DECIMAL(5,4) NOT NULL,
  threat_escalation BOOLEAN NOT NULL DEFAULT FALSE,
  escalation_rate DECIMAL(8,6), -- Threat increase per second
  
  -- Movement patterns
  total_loitering_time INTEGER, -- seconds
  area_familiarity DECIMAL(5,4), -- 0-1
  surveillance_incidents INTEGER DEFAULT 0,
  
  -- Temporal data
  first_detected TIMESTAMPTZ NOT NULL,
  last_detected TIMESTAMPTZ NOT NULL,
  total_observations INTEGER NOT NULL DEFAULT 1,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mindsense_behavioral_patterns_person ON mindsense_behavioral_patterns(person_track_id);
CREATE INDEX idx_mindsense_behavioral_patterns_threat ON mindsense_behavioral_patterns(peak_threat_score DESC);
CREATE INDEX idx_mindsense_behavioral_patterns_escalation ON mindsense_behavioral_patterns(threat_escalation) WHERE threat_escalation = TRUE;

-- =====================================================
-- De-escalation Coaching
-- =====================================================

/**
 * Coaching recommendations
 * Real-time de-escalation guidance provided to security staff
 */
CREATE TABLE IF NOT EXISTS mindsense_coaching_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  person_track_id VARCHAR(255) NOT NULL,
  
  -- Situation
  situation_type VARCHAR(50) NOT NULL, -- aggressive-customer, distressed-person, etc.
  phase VARCHAR(20) NOT NULL, -- assessment, approach, engagement, resolution, monitoring, handoff
  priority VARCHAR(20) NOT NULL, -- low, medium, high, critical, urgent
  
  -- Assessment
  threat_level VARCHAR(20) NOT NULL,
  emotional_state VARCHAR(50) NOT NULL,
  stress_level DECIMAL(5,4) NOT NULL,
  intent VARCHAR(50) NOT NULL,
  
  -- Recommendations
  recommended_techniques JSONB NOT NULL, -- Array of technique names
  communication_strategy JSONB NOT NULL, -- { "tone": "calm", "volume": "soft", ... }
  immediate_dos JSONB NOT NULL,
  immediate_donts JSONB NOT NULL,
  suggested_phrases JSONB NOT NULL,
  
  -- Safety
  backup_required BOOLEAN NOT NULL DEFAULT FALSE,
  safety_precautions JSONB NOT NULL,
  exit_strategy TEXT,
  
  -- Security staff
  security_staff_id UUID REFERENCES users(id),
  viewed_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mindsense_coaching_recommendations_camera ON mindsense_coaching_recommendations(camera_id, created_at DESC);
CREATE INDEX idx_mindsense_coaching_recommendations_person ON mindsense_coaching_recommendations(person_track_id, created_at DESC);
CREATE INDEX idx_mindsense_coaching_recommendations_staff ON mindsense_coaching_recommendations(security_staff_id, created_at DESC);
CREATE INDEX idx_mindsense_coaching_recommendations_priority ON mindsense_coaching_recommendations(priority, created_at DESC) WHERE priority IN ('critical', 'urgent', 'high');

/**
 * De-escalation outcomes
 * Track effectiveness of coaching recommendations
 */
CREATE TABLE IF NOT EXISTS mindsense_deescalation_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  coaching_recommendation_id UUID REFERENCES mindsense_coaching_recommendations(id),
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  person_track_id VARCHAR(255) NOT NULL,
  
  -- Situation resolution
  outcome VARCHAR(50) NOT NULL, -- successful, escalated, police-called, unresolved
  resolution_time INTEGER, -- seconds from recommendation to resolution
  
  -- Techniques used
  techniques_applied JSONB, -- Array of technique IDs actually used
  effectiveness_rating INTEGER CHECK (effectiveness_rating >= 1 AND effectiveness_rating <= 5),
  
  -- Threat progression
  initial_threat_level VARCHAR(20) NOT NULL,
  final_threat_level VARCHAR(20) NOT NULL,
  threat_reduced BOOLEAN NOT NULL,
  
  -- Staff feedback
  security_staff_id UUID REFERENCES users(id),
  staff_notes TEXT,
  challenges_encountered JSONB,
  
  -- Incident linkage
  incident_id UUID REFERENCES incidents(id),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mindsense_deescalation_outcomes_recommendation ON mindsense_deescalation_outcomes(coaching_recommendation_id);
CREATE INDEX idx_mindsense_deescalation_outcomes_person ON mindsense_deescalation_outcomes(person_track_id);
CREATE INDEX idx_mindsense_deescalation_outcomes_outcome ON mindsense_deescalation_outcomes(outcome, created_at DESC);
CREATE INDEX idx_mindsense_deescalation_outcomes_effectiveness ON mindsense_deescalation_outcomes(effectiveness_rating);

-- =====================================================
-- Analytics and Reporting
-- =====================================================

/**
 * Emotional analytics summary
 * Aggregated emotional intelligence metrics for reporting
 */
CREATE TABLE IF NOT EXISTS mindsense_analytics_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id),
  camera_id UUID REFERENCES cameras(id) ON DELETE CASCADE,
  
  -- Time period
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  period_type VARCHAR(20) NOT NULL, -- hourly, daily, weekly, monthly
  
  -- Emotion distribution
  emotion_counts JSONB NOT NULL, -- { "happiness": 150, "anger": 20, ... }
  dominant_emotion VARCHAR(50) NOT NULL,
  
  -- Stress analytics
  avg_stress_level DECIMAL(5,4) NOT NULL,
  high_stress_incidents INTEGER NOT NULL DEFAULT 0,
  stress_peak_times JSONB, -- Array of {hour, avgStress}
  
  -- Threat analytics
  threat_counts JSONB NOT NULL, -- { "none": 500, "low": 50, "medium": 10, "high": 2 }
  total_threats INTEGER NOT NULL DEFAULT 0,
  critical_threats INTEGER NOT NULL DEFAULT 0,
  
  -- Deception analytics
  avg_deception_score DECIMAL(5,4) NOT NULL,
  high_deception_incidents INTEGER NOT NULL DEFAULT 0,
  
  -- Behavioral intent
  intent_distribution JSONB NOT NULL, -- { "benign": 450, "nervous": 30, "suspicious": 15 }
  
  -- De-escalation metrics
  coaching_requests INTEGER NOT NULL DEFAULT 0,
  successful_deescalations INTEGER NOT NULL DEFAULT 0,
  deescalation_success_rate DECIMAL(5,4),
  
  -- People analytics
  unique_persons INTEGER NOT NULL DEFAULT 0,
  total_observations INTEGER NOT NULL DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mindsense_analytics_summary_branch ON mindsense_analytics_summary(branch_id, period_start DESC);
CREATE INDEX idx_mindsense_analytics_summary_camera ON mindsense_analytics_summary(camera_id, period_start DESC);
CREATE INDEX idx_mindsense_analytics_summary_period ON mindsense_analytics_summary(period_start DESC, period_type);
CREATE INDEX idx_mindsense_analytics_summary_threats ON mindsense_analytics_summary(critical_threats DESC) WHERE critical_threats > 0;

/**
 * Stress hotspots
 * Locations with consistently high stress levels
 */
CREATE TABLE IF NOT EXISTS mindsense_stress_hotspots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id),
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  zone_name VARCHAR(255),
  
  -- Time period
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  
  -- Stress metrics
  high_stress_count INTEGER NOT NULL,
  avg_stress_score DECIMAL(5,4) NOT NULL,
  peak_stress_score DECIMAL(5,4) NOT NULL,
  
  -- People affected
  unique_persons INTEGER NOT NULL,
  
  -- Pattern analysis
  peak_hours JSONB, -- Array of hours with highest stress
  emotions_observed JSONB, -- Array of emotions seen
  
  -- Severity classification
  severity VARCHAR(20) NOT NULL, -- low, medium, high, critical
  
  -- Recommendations
  recommended_actions JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mindsense_stress_hotspots_branch ON mindsense_stress_hotspots(branch_id, period_start DESC);
CREATE INDEX idx_mindsense_stress_hotspots_camera ON mindsense_stress_hotspots(camera_id, period_start DESC);
CREATE INDEX idx_mindsense_stress_hotspots_severity ON mindsense_stress_hotspots(severity, avg_stress_score DESC);

-- =====================================================
-- Materialized Views for Performance
-- =====================================================

/**
 * Real-time dashboard view
 * Current emotional intelligence status
 */
CREATE MATERIALIZED VIEW IF NOT EXISTS mindsense_realtime_dashboard AS
SELECT 
  c.tenant_id,
  c.id as camera_id,
  c.name as camera_name,
  c.branch_id,
  COUNT(DISTINCT es.person_track_id) as active_persons,
  AVG(es.stress_score) as avg_stress,
  MAX(es.stress_score) as max_stress,
  COUNT(*) FILTER (WHERE es.stress_score > 0.7) as high_stress_count,
  COUNT(*) FILTER (WHERE ta.threat_level IN ('high', 'critical')) as active_threats,
  MAX(ta.threat_score) as max_threat_score,
  ARRAY_AGG(DISTINCT es.emotion) as emotions_detected,
  NOW() as last_updated
FROM cameras c
LEFT JOIN mindsense_emotional_states es ON c.id = es.camera_id 
  AND es.timestamp > NOW() - INTERVAL '5 minutes'
LEFT JOIN mindsense_threat_assessments ta ON c.id = ta.camera_id 
  AND ta.timestamp > NOW() - INTERVAL '5 minutes'
GROUP BY c.tenant_id, c.id, c.name, c.branch_id;

CREATE UNIQUE INDEX idx_mindsense_realtime_dashboard_camera ON mindsense_realtime_dashboard(camera_id);
CREATE INDEX idx_mindsense_realtime_dashboard_branch ON mindsense_realtime_dashboard(branch_id);
CREATE INDEX idx_mindsense_realtime_dashboard_threats ON mindsense_realtime_dashboard(active_threats DESC) WHERE active_threats > 0;

-- Refresh function for dashboard (call every 30 seconds)
CREATE OR REPLACE FUNCTION refresh_mindsense_dashboard()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mindsense_realtime_dashboard;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Cleanup and Retention Functions
-- =====================================================

/**
 * Clean up old emotional state data
 * Keeps recent data, archives or deletes old records
 */
CREATE OR REPLACE FUNCTION cleanup_mindsense_emotional_data(retention_days INTEGER DEFAULT 30)
RETURNS TABLE(deleted_states INTEGER, deleted_timeline INTEGER, deleted_micro INTEGER) AS $$
DECLARE
  deleted_states_count INTEGER;
  deleted_timeline_count INTEGER;
  deleted_micro_count INTEGER;
  cutoff_date TIMESTAMPTZ;
BEGIN
  cutoff_date := NOW() - (retention_days || ' days')::INTERVAL;
  
  -- Delete old emotional states
  DELETE FROM mindsense_emotional_states WHERE timestamp < cutoff_date;
  GET DIAGNOSTICS deleted_states_count = ROW_COUNT;
  
  -- Delete old timeline entries
  DELETE FROM mindsense_emotional_timeline WHERE timestamp < cutoff_date;
  GET DIAGNOSTICS deleted_timeline_count = ROW_COUNT;
  
  -- Delete old micro-expressions
  DELETE FROM mindsense_micro_expressions WHERE start_time < cutoff_date;
  GET DIAGNOSTICS deleted_micro_count = ROW_COUNT;
  
  deleted_states := deleted_states_count;
  deleted_timeline := deleted_timeline_count;
  deleted_micro := deleted_micro_count;
  
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Grants
-- =====================================================

-- Grant permissions to application user (adjust role name as needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON TABLE mindsense_emotional_states IS 'Real-time emotional analysis with stress and deception indicators';
COMMENT ON TABLE mindsense_emotional_profiles IS 'Aggregated emotional profiles for tracked persons';
COMMENT ON TABLE mindsense_micro_expressions IS 'Fleeting expressions (40-500ms) revealing true emotions';
COMMENT ON TABLE mindsense_threat_assessments IS 'Behavioral intent recognition and threat scoring';
COMMENT ON TABLE mindsense_coaching_recommendations IS 'Real-time de-escalation guidance for security staff';
COMMENT ON TABLE mindsense_deescalation_outcomes IS 'Effectiveness tracking for de-escalation interventions';
COMMENT ON TABLE mindsense_analytics_summary IS 'Aggregated emotional intelligence metrics';
COMMENT ON TABLE mindsense_stress_hotspots IS 'Locations with consistently high stress levels';
