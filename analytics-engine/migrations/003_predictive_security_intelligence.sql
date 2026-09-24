/**
 * Predictive Security Intelligence Database Migration
 * 
 * Creates all tables for AI-Powered Predictive Security Intelligence ("SecurityGPT"):
 * - Behavioral Pattern Learning
 * - Risk Heat Maps
 * - Proactive Patrol Planning
 * - Security Anomaly Detection
 * - Real-time Risk Predictions
 */

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis"; -- For spatial data
CREATE EXTENSION IF NOT EXISTS "timescaledb" CASCADE; -- For time-series optimization (optional but recommended)

-- =====================================================
-- BEHAVIORAL OBSERVATION TABLE
-- Raw behavioral data for pattern learning
-- =====================================================
CREATE TABLE IF NOT EXISTS behavioral_observation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  camera_id UUID NOT NULL,
  
  -- Observation details
  observation_type TEXT NOT NULL, -- 'person', 'vehicle', 'access', 'environmental'
  entity_id TEXT, -- Global person ID, vehicle ID, etc.
  
  -- Spatial-temporal
  observed_at TIMESTAMPTZ NOT NULL,
  location GEOGRAPHY(POINT, 4326), -- PostGIS point (lon, lat)
  zone_id TEXT,
  
  -- Behavioral attributes (JSONB for flexibility)
  attributes JSONB NOT NULL DEFAULT '{}',
  -- Examples:
  -- Person: {velocity: 1.2, direction: 45, dwell_time: 120, posture: 'standing', group_size: 1}
  -- Vehicle: {speed: 25, vehicle_type: 'car', direction: 'north'}
  -- Access: {card_id: '12345', access_type: 'entry', authorized: true}
  
  -- Context
  day_of_week INTEGER NOT NULL, -- 0=Sunday, 6=Saturday
  hour_of_day INTEGER NOT NULL, -- 0-23
  is_business_hours BOOLEAN NOT NULL,
  weather_condition TEXT, -- 'clear', 'rain', 'snow', etc.
  
  -- Metadata
  confidence NUMERIC(4,3) NOT NULL DEFAULT 1.0,
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT chk_bo_confidence CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT chk_bo_type CHECK (observation_type IN ('person', 'vehicle', 'access', 'environmental', 'event')),
  CONSTRAINT chk_bo_dow CHECK (day_of_week >= 0 AND day_of_week <= 6),
  CONSTRAINT chk_bo_hour CHECK (hour_of_day >= 0 AND hour_of_day <= 23)
);

CREATE INDEX idx_behavioral_obs_tenant_time 
ON behavioral_observation (tenant_id, observed_at DESC);

CREATE INDEX idx_behavioral_obs_branch_time 
ON behavioral_observation (branch_id, observed_at DESC);

CREATE INDEX idx_behavioral_obs_camera_time 
ON behavioral_observation (camera_id, observed_at DESC);

CREATE INDEX idx_behavioral_obs_type_time 
ON behavioral_observation (tenant_id, observation_type, observed_at DESC);

CREATE INDEX idx_behavioral_obs_zone_time 
ON behavioral_observation (tenant_id, zone_id, observed_at DESC)
WHERE zone_id IS NOT NULL;

CREATE INDEX idx_behavioral_obs_entity 
ON behavioral_observation (tenant_id, entity_id, observed_at DESC)
WHERE entity_id IS NOT NULL;

-- Spatial index for location-based queries
CREATE INDEX idx_behavioral_obs_location 
ON behavioral_observation USING GIST (location);

-- Time-series optimization (if TimescaleDB is available)
-- SELECT create_hypertable('behavioral_observation', 'observed_at', if_not_exists => TRUE);

COMMENT ON TABLE behavioral_observation IS 'Raw behavioral observations for machine learning pattern detection';

-- =====================================================
-- BEHAVIORAL PROFILE TABLE
-- Learned normal patterns per location/time/entity
-- =====================================================
CREATE TABLE IF NOT EXISTS behavioral_profile (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  
  -- Profile scope
  profile_type TEXT NOT NULL, -- 'location', 'zone', 'camera', 'temporal', 'entity'
  scope_id TEXT NOT NULL, -- Zone ID, camera ID, or 'branch' for temporal
  
  -- Temporal scope
  day_of_week INTEGER, -- NULL = all days
  hour_of_day INTEGER, -- NULL = all hours
  time_window TEXT, -- 'business_hours', 'after_hours', 'weekend', etc.
  
  -- Statistical baseline (learned normal behavior)
  baseline JSONB NOT NULL DEFAULT '{}',
  -- Example:
  -- {
  --   "person_count": {"mean": 15, "std_dev": 3, "min": 8, "max": 25},
  --   "avg_velocity": {"mean": 1.2, "std_dev": 0.3},
  --   "dwell_time": {"mean": 180, "std_dev": 45},
  --   "vehicle_count": {"mean": 5, "std_dev": 2}
  -- }
  
  -- Learning metadata
  observation_count INTEGER NOT NULL DEFAULT 0,
  first_observation_at TIMESTAMPTZ NOT NULL,
  last_observation_at TIMESTAMPTZ NOT NULL,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Confidence (higher = more data, better accuracy)
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  
  -- Version (for model evolution tracking)
  model_version TEXT NOT NULL DEFAULT '1.0',
  
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT chk_bp_confidence CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT chk_bp_profile_type CHECK (profile_type IN ('location', 'zone', 'camera', 'temporal', 'entity')),
  CONSTRAINT chk_bp_dow CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6)),
  CONSTRAINT chk_bp_hour CHECK (hour_of_day IS NULL OR (hour_of_day >= 0 AND hour_of_day <= 23))
);

CREATE INDEX idx_behavioral_profile_tenant 
ON behavioral_profile (tenant_id, profile_type);

CREATE INDEX idx_behavioral_profile_scope 
ON behavioral_profile (tenant_id, profile_type, scope_id);

CREATE INDEX idx_behavioral_profile_temporal 
ON behavioral_profile (tenant_id, day_of_week, hour_of_day)
WHERE day_of_week IS NOT NULL AND hour_of_day IS NOT NULL;

CREATE UNIQUE INDEX idx_behavioral_profile_unique 
ON behavioral_profile (
  tenant_id, profile_type, scope_id,
  COALESCE(day_of_week, -1), COALESCE(hour_of_day, -1),
  COALESCE(time_window, '')
);

COMMENT ON TABLE behavioral_profile IS 'Learned normal behavioral patterns for anomaly detection';

-- =====================================================
-- BEHAVIORAL ANOMALY TABLE
-- Detected anomalies (deviations from learned patterns)
-- =====================================================
CREATE TABLE IF NOT EXISTS behavioral_anomaly (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  
  -- Anomaly source
  profile_id UUID NOT NULL REFERENCES behavioral_profile(id),
  observation_id UUID REFERENCES behavioral_observation(id),
  
  -- Detection details
  detected_at TIMESTAMPTZ NOT NULL,
  anomaly_type TEXT NOT NULL, -- 'statistical', 'behavioral', 'temporal', 'spatial'
  severity TEXT NOT NULL, -- 'low', 'medium', 'high', 'critical'
  
  -- Anomaly metrics
  anomaly_score NUMERIC(6,3) NOT NULL, -- How far from normal (0-infinity, typically 0-10)
  confidence NUMERIC(4,3) NOT NULL, -- Confidence in anomaly detection (0-1)
  standard_deviations NUMERIC(6,2), -- Sigma distance from mean
  
  -- Details
  expected_value JSONB NOT NULL, -- What was expected
  actual_value JSONB NOT NULL, -- What was observed
  deviation_details JSONB NOT NULL, -- Detailed deviation metrics
  
  -- Context
  location GEOGRAPHY(POINT, 4326),
  zone_id TEXT,
  camera_id UUID,
  
  -- Resolution
  status TEXT NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_POSITIVE'
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  
  -- Incident correlation
  incident_id UUID, -- Link to created incident
  incident_created BOOLEAN NOT NULL DEFAULT FALSE,
  
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT chk_ba_anomaly_type CHECK (anomaly_type IN ('statistical', 'behavioral', 'temporal', 'spatial', 'combined')),
  CONSTRAINT chk_ba_severity CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT chk_ba_status CHECK (status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_POSITIVE')),
  CONSTRAINT chk_ba_confidence CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT chk_ba_anomaly_score CHECK (anomaly_score >= 0)
);

CREATE INDEX idx_behavioral_anomaly_tenant_time 
ON behavioral_anomaly (tenant_id, detected_at DESC);

CREATE INDEX idx_behavioral_anomaly_branch_time 
ON behavioral_anomaly (branch_id, detected_at DESC);

CREATE INDEX idx_behavioral_anomaly_profile 
ON behavioral_anomaly (profile_id, detected_at DESC);

CREATE INDEX idx_behavioral_anomaly_active 
ON behavioral_anomaly (tenant_id, status, detected_at DESC)
WHERE status = 'ACTIVE';

CREATE INDEX idx_behavioral_anomaly_severity 
ON behavioral_anomaly (tenant_id, severity, detected_at DESC)
WHERE severity IN ('high', 'critical');

CREATE INDEX idx_behavioral_anomaly_location 
ON behavioral_anomaly USING GIST (location)
WHERE location IS NOT NULL;

COMMENT ON TABLE behavioral_anomaly IS 'Detected behavioral anomalies requiring investigation';

-- =====================================================
-- SECURITY RISK HEATMAP TABLE
-- Spatial risk predictions (grid-based)
-- =====================================================
CREATE TABLE IF NOT EXISTS security_risk_heatmap (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  
  -- Spatial grid
  grid_cell_id TEXT NOT NULL, -- Geohash or custom grid ID
  grid_bounds GEOGRAPHY(POLYGON, 4326) NOT NULL, -- Cell boundary
  center_point GEOGRAPHY(POINT, 4326) NOT NULL,
  
  -- Temporal scope
  prediction_for_time TIMESTAMPTZ NOT NULL, -- What time this prediction is for
  day_of_week INTEGER NOT NULL,
  hour_of_day INTEGER NOT NULL,
  
  -- Risk metrics
  risk_score NUMERIC(6,3) NOT NULL, -- 0-100
  risk_level TEXT NOT NULL, -- 'low', 'medium', 'high', 'critical'
  
  -- Risk breakdown by category
  risk_components JSONB NOT NULL DEFAULT '{}',
  -- Example:
  -- {
  --   "intrusion_risk": 0.7,
  --   "theft_risk": 0.5,
  --   "violence_risk": 0.3,
  --   "unauthorized_access_risk": 0.6,
  --   "anomaly_risk": 0.8
  -- }
  
  -- Prediction confidence
  confidence NUMERIC(4,3) NOT NULL,
  data_quality_score NUMERIC(4,3) NOT NULL,
  
  -- Contributing factors
  contributing_factors JSONB NOT NULL DEFAULT '[]',
  -- Example: ["high_incident_history", "recent_anomalies", "low_patrol_coverage", "blind_spot"]
  
  -- Historical context
  historical_incidents_count INTEGER NOT NULL DEFAULT 0,
  recent_anomalies_count INTEGER NOT NULL DEFAULT 0,
  
  -- Metadata
  model_version TEXT NOT NULL DEFAULT '1.0',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL, -- Prediction staleness
  
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT chk_srh_risk_score CHECK (risk_score >= 0 AND risk_score <= 100),
  CONSTRAINT chk_srh_risk_level CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT chk_srh_confidence CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT chk_srh_data_quality CHECK (data_quality_score >= 0 AND data_quality_score <= 1),
  CONSTRAINT chk_srh_dow CHECK (day_of_week >= 0 AND day_of_week <= 6),
  CONSTRAINT chk_srh_hour CHECK (hour_of_day >= 0 AND hour_of_day <= 23)
);

CREATE INDEX idx_risk_heatmap_tenant_time 
ON security_risk_heatmap (tenant_id, prediction_for_time DESC);

CREATE INDEX idx_risk_heatmap_branch_time 
ON security_risk_heatmap (branch_id, prediction_for_time DESC);

CREATE INDEX idx_risk_heatmap_grid 
ON security_risk_heatmap (tenant_id, branch_id, grid_cell_id);

CREATE INDEX idx_risk_heatmap_risk_level 
ON security_risk_heatmap (tenant_id, risk_level, prediction_for_time DESC)
WHERE risk_level IN ('high', 'critical');

CREATE INDEX idx_risk_heatmap_temporal 
ON security_risk_heatmap (tenant_id, day_of_week, hour_of_day);

CREATE INDEX idx_risk_heatmap_spatial 
ON security_risk_heatmap USING GIST (grid_bounds);

CREATE INDEX idx_risk_heatmap_center 
ON security_risk_heatmap USING GIST (center_point);

CREATE INDEX idx_risk_heatmap_active 
ON security_risk_heatmap (tenant_id, branch_id, prediction_for_time DESC)
WHERE expires_at > NOW();

COMMENT ON TABLE security_risk_heatmap IS 'Spatial-temporal risk predictions for proactive security';

-- =====================================================
-- PATROL PLAN TABLE
-- Optimized patrol plans based on predicted risk
-- =====================================================
CREATE TABLE IF NOT EXISTS patrol_plan (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  
  -- Plan details
  plan_name TEXT NOT NULL,
  plan_type TEXT NOT NULL, -- 'proactive', 'reactive', 'routine', 'emergency'
  
  -- Temporal scope
  planned_for_date DATE NOT NULL,
  shift_start_time TIME NOT NULL,
  shift_end_time TIME NOT NULL,
  
  -- Optimization details
  optimization_objective TEXT NOT NULL, -- 'minimize_risk', 'maximize_coverage', 'balanced'
  total_risk_covered NUMERIC(8,3) NOT NULL, -- Sum of risk scores covered
  coverage_percentage NUMERIC(5,2) NOT NULL, -- % of high-risk areas covered
  
  -- Resource requirements
  required_officers INTEGER NOT NULL DEFAULT 1,
  estimated_duration_minutes INTEGER NOT NULL,
  
  -- Routes (multiple routes for multiple officers)
  routes JSONB NOT NULL, -- Array of route objects
  -- Example:
  -- [
  --   {
  --     "officer_id": "off_001",
  --     "checkpoints": [
  --       {"zone_id": "Z01", "location": {"lat": 40.7, "lon": -74.0}, "arrival_time": "08:15", "duration_minutes": 5, "risk_score": 85},
  --       {"zone_id": "Z05", "location": {"lat": 40.71, "lon": -74.01}, "arrival_time": "08:30", "duration_minutes": 10, "risk_score": 90}
  --     ],
  --     "total_distance_meters": 1500
  --   }
  -- ]
  
  -- High-risk zones prioritized
  priority_zones JSONB NOT NULL DEFAULT '[]',
  -- Example: [{"zone_id": "Z05", "risk_score": 90, "reason": "recent_anomaly"}]
  
  -- Status
  status TEXT NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'APPROVED', 'ACTIVE', 'COMPLETED', 'CANCELLED'
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  
  -- Execution tracking
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Effectiveness metrics (filled after completion)
  effectiveness_score NUMERIC(4,3),
  incidents_prevented_estimate INTEGER,
  anomalies_detected_count INTEGER,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT chk_pp_plan_type CHECK (plan_type IN ('proactive', 'reactive', 'routine', 'emergency')),
  CONSTRAINT chk_pp_optimization CHECK (optimization_objective IN ('minimize_risk', 'maximize_coverage', 'balanced', 'rapid_response')),
  CONSTRAINT chk_pp_coverage CHECK (coverage_percentage >= 0 AND coverage_percentage <= 100),
  CONSTRAINT chk_pp_status CHECK (status IN ('DRAFT', 'APPROVED', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
  CONSTRAINT chk_pp_effectiveness CHECK (effectiveness_score IS NULL OR (effectiveness_score >= 0 AND effectiveness_score <= 1))
);

CREATE INDEX idx_patrol_plan_tenant_date 
ON patrol_plan (tenant_id, planned_for_date DESC);

CREATE INDEX idx_patrol_plan_branch_date 
ON patrol_plan (branch_id, planned_for_date DESC);

CREATE INDEX idx_patrol_plan_status 
ON patrol_plan (tenant_id, status, planned_for_date DESC);

CREATE INDEX idx_patrol_plan_active 
ON patrol_plan (tenant_id, branch_id)
WHERE status = 'ACTIVE';

COMMENT ON TABLE patrol_plan IS 'AI-optimized patrol plans based on predictive risk analysis';

-- =====================================================
-- PATROL CHECKPOINT TABLE
-- Real-time patrol execution tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS patrol_checkpoint (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  tenant_id UUID NOT NULL,
  patrol_plan_id UUID NOT NULL REFERENCES patrol_plan(id) ON DELETE CASCADE,
  
  -- Checkpoint details
  checkpoint_index INTEGER NOT NULL, -- Order in route
  zone_id TEXT NOT NULL,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  
  -- Planned vs actual
  planned_arrival_time TIMESTAMPTZ NOT NULL,
  actual_arrival_time TIMESTAMPTZ,
  
  planned_duration_minutes INTEGER NOT NULL,
  actual_duration_minutes INTEGER,
  
  -- Risk context
  predicted_risk_score NUMERIC(6,3) NOT NULL,
  
  -- Execution
  officer_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED'
  
  -- Observations during checkpoint
  observations JSONB DEFAULT '[]',
  -- Example: [{"type": "anomaly", "description": "Suspicious activity", "severity": "medium"}]
  
  anomalies_detected INTEGER NOT NULL DEFAULT 0,
  incidents_created INTEGER NOT NULL DEFAULT 0,
  
  -- Photos/evidence
  evidence_attachments JSONB DEFAULT '[]',
  
  -- Notes
  officer_notes TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT chk_pc_status CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'CANCELLED'))
);

CREATE INDEX idx_patrol_checkpoint_plan 
ON patrol_checkpoint (patrol_plan_id, checkpoint_index);

CREATE INDEX idx_patrol_checkpoint_zone 
ON patrol_checkpoint (tenant_id, zone_id, planned_arrival_time DESC);

CREATE INDEX idx_patrol_checkpoint_status 
ON patrol_checkpoint (patrol_plan_id, status);

CREATE INDEX idx_patrol_checkpoint_location 
ON patrol_checkpoint USING GIST (location);

COMMENT ON TABLE patrol_checkpoint IS 'Individual patrol checkpoint tracking and observations';

-- =====================================================
-- SECURITY INCIDENT PREDICTION TABLE
-- Time-series predictions of specific incident types
-- =====================================================
CREATE TABLE IF NOT EXISTS security_incident_prediction (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  
  -- Prediction scope
  incident_type TEXT NOT NULL, -- 'intrusion', 'theft', 'violence', 'unauthorized_access', etc.
  location_scope TEXT NOT NULL, -- 'branch', 'zone', 'camera'
  scope_id TEXT NOT NULL,
  
  -- Time window
  prediction_window_start TIMESTAMPTZ NOT NULL,
  prediction_window_end TIMESTAMPTZ NOT NULL,
  prediction_horizon_hours INTEGER NOT NULL,
  
  -- Prediction
  probability NUMERIC(4,3) NOT NULL, -- 0-1
  risk_level TEXT NOT NULL,
  confidence NUMERIC(4,3) NOT NULL,
  
  -- Details
  expected_time_range TSTZRANGE, -- Most likely time range
  contributing_factors JSONB NOT NULL DEFAULT '[]',
  
  -- Historical context
  historical_incidents_count INTEGER NOT NULL DEFAULT 0,
  recent_anomalies_count INTEGER NOT NULL DEFAULT 0,
  similar_pattern_matches INTEGER NOT NULL DEFAULT 0,
  
  -- Recommendations
  preventive_actions JSONB NOT NULL DEFAULT '[]',
  recommended_patrol_zones JSONB DEFAULT '[]',
  
  -- Tracking
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  outcome TEXT, -- 'INCIDENT_OCCURRED', 'PREVENTED', 'FALSE_POSITIVE', 'UNKNOWN'
  actual_incident_id UUID,
  
  -- Metadata
  model_version TEXT NOT NULL DEFAULT '1.0',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT chk_sip_probability CHECK (probability >= 0 AND probability <= 1),
  CONSTRAINT chk_sip_confidence CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT chk_sip_risk_level CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT chk_sip_status CHECK (status IN ('ACTIVE', 'EXPIRED', 'CLOSED')),
  CONSTRAINT chk_sip_outcome CHECK (outcome IS NULL OR outcome IN ('INCIDENT_OCCURRED', 'PREVENTED', 'FALSE_POSITIVE', 'UNKNOWN'))
);

CREATE INDEX idx_incident_prediction_tenant_time 
ON security_incident_prediction (tenant_id, prediction_window_start DESC);

CREATE INDEX idx_incident_prediction_branch_time 
ON security_incident_prediction (branch_id, prediction_window_start DESC);

CREATE INDEX idx_incident_prediction_scope 
ON security_incident_prediction (tenant_id, location_scope, scope_id);

CREATE INDEX idx_incident_prediction_type 
ON security_incident_prediction (tenant_id, incident_type, prediction_window_start DESC);

CREATE INDEX idx_incident_prediction_high_risk 
ON security_incident_prediction (tenant_id, risk_level, probability DESC)
WHERE risk_level IN ('high', 'critical') AND status = 'ACTIVE';

COMMENT ON TABLE security_incident_prediction IS 'Predictive incident forecasting with time windows and probabilities';

-- =====================================================
-- SECURITY INTELLIGENCE REPORT TABLE
-- Daily/hourly summary reports
-- =====================================================
CREATE TABLE IF NOT EXISTS security_intelligence_report (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  tenant_id UUID NOT NULL,
  branch_id UUID,
  
  -- Report scope
  report_type TEXT NOT NULL, -- 'daily', 'shift', 'weekly', 'realtime'
  report_period_start TIMESTAMPTZ NOT NULL,
  report_period_end TIMESTAMPTZ NOT NULL,
  
  -- Summary metrics
  total_observations INTEGER NOT NULL DEFAULT 0,
  total_anomalies INTEGER NOT NULL DEFAULT 0,
  total_incidents INTEGER NOT NULL DEFAULT 0,
  
  anomalies_by_severity JSONB NOT NULL DEFAULT '{}',
  -- Example: {"low": 5, "medium": 3, "high": 2, "critical": 0}
  
  incidents_by_type JSONB NOT NULL DEFAULT '{}',
  -- Example: {"intrusion": 2, "theft": 1, "unauthorized_access": 1}
  
  -- Risk assessment
  overall_risk_score NUMERIC(6,3) NOT NULL,
  risk_trend TEXT NOT NULL, -- 'increasing', 'stable', 'decreasing'
  
  top_risk_zones JSONB NOT NULL DEFAULT '[]',
  -- Example: [{"zone_id": "Z05", "risk_score": 90, "anomaly_count": 5}]
  
  -- Patrol effectiveness
  patrols_completed INTEGER NOT NULL DEFAULT 0,
  patrol_coverage_percentage NUMERIC(5,2),
  incidents_prevented_estimate INTEGER,
  
  -- Predictions
  active_predictions_count INTEGER NOT NULL DEFAULT 0,
  high_risk_predictions_count INTEGER NOT NULL DEFAULT 0,
  
  -- Recommendations
  recommendations JSONB NOT NULL DEFAULT '[]',
  priority_actions JSONB NOT NULL DEFAULT '[]',
  
  -- Metadata
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by TEXT NOT NULL, -- 'SYSTEM', user ID
  
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT chk_sir_report_type CHECK (report_type IN ('daily', 'shift', 'weekly', 'monthly', 'realtime')),
  CONSTRAINT chk_sir_risk_trend CHECK (risk_trend IN ('increasing', 'stable', 'decreasing', 'unknown'))
);

CREATE INDEX idx_security_report_tenant_time 
ON security_intelligence_report (tenant_id, report_period_start DESC);

CREATE INDEX idx_security_report_branch_time 
ON security_intelligence_report (branch_id, report_period_start DESC)
WHERE branch_id IS NOT NULL;

CREATE INDEX idx_security_report_type 
ON security_intelligence_report (tenant_id, report_type, report_period_start DESC);

COMMENT ON TABLE security_intelligence_report IS 'Consolidated security intelligence reports for decision-making';

-- =====================================================
-- LEARNING MODEL STATE TABLE
-- Track ML model training state and performance
-- =====================================================
CREATE TABLE IF NOT EXISTS security_ml_model_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  tenant_id UUID NOT NULL,
  branch_id UUID, -- NULL for tenant-wide models
  
  -- Model details
  model_type TEXT NOT NULL, -- 'behavioral_baseline', 'anomaly_detector', 'risk_predictor', 'patrol_optimizer'
  model_version TEXT NOT NULL,
  
  -- Training state
  training_status TEXT NOT NULL, -- 'INITIALIZING', 'TRAINING', 'READY', 'RETRAINING', 'DEPRECATED'
  training_started_at TIMESTAMPTZ,
  training_completed_at TIMESTAMPTZ,
  
  -- Data requirements
  min_observations_required INTEGER NOT NULL,
  current_observations_count INTEGER NOT NULL DEFAULT 0,
  data_quality_score NUMERIC(4,3),
  
  -- Performance metrics
  accuracy NUMERIC(4,3),
  precision_score NUMERIC(4,3),
  recall NUMERIC(4,3),
  f1_score NUMERIC(4,3),
  false_positive_rate NUMERIC(4,3),
  
  -- Model parameters (JSONB for flexibility)
  model_parameters JSONB NOT NULL DEFAULT '{}',
  
  -- Version history
  previous_version TEXT,
  version_notes TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT chk_sml_model_type CHECK (model_type IN ('behavioral_baseline', 'anomaly_detector', 'risk_predictor', 'patrol_optimizer')),
  CONSTRAINT chk_sml_status CHECK (training_status IN ('INITIALIZING', 'TRAINING', 'READY', 'RETRAINING', 'DEPRECATED', 'FAILED'))
);

CREATE INDEX idx_ml_model_tenant_type 
ON security_ml_model_state (tenant_id, model_type);

CREATE INDEX idx_ml_model_branch 
ON security_ml_model_state (branch_id, model_type)
WHERE branch_id IS NOT NULL;

CREATE INDEX idx_ml_model_status 
ON security_ml_model_state (tenant_id, training_status);

CREATE UNIQUE INDEX idx_ml_model_unique_active 
ON security_ml_model_state (tenant_id, COALESCE(branch_id::TEXT, 'TENANT'), model_type)
WHERE training_status = 'READY';

COMMENT ON TABLE security_ml_model_state IS 'ML model training state and performance tracking';

-- =====================================================
-- CREATE MATERIALIZED VIEWS FOR PERFORMANCE
-- =====================================================

-- Real-time risk summary by branch
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_branch_risk_summary AS
SELECT 
  tenant_id,
  branch_id,
  MAX(prediction_for_time) as last_prediction_time,
  AVG(risk_score) as avg_risk_score,
  MAX(risk_score) as max_risk_score,
  COUNT(*) FILTER (WHERE risk_level IN ('high', 'critical')) as high_risk_cells_count,
  array_agg(DISTINCT grid_cell_id) FILTER (WHERE risk_level = 'critical') as critical_zones
FROM security_risk_heatmap
WHERE expires_at > NOW()
GROUP BY tenant_id, branch_id;

CREATE UNIQUE INDEX idx_mv_branch_risk_summary 
ON mv_branch_risk_summary (tenant_id, branch_id);

-- Anomaly summary by zone
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_zone_anomaly_summary AS
SELECT 
  tenant_id,
  zone_id,
  DATE(detected_at) as detection_date,
  COUNT(*) as anomaly_count,
  COUNT(*) FILTER (WHERE severity IN ('high', 'critical')) as critical_anomaly_count,
  AVG(anomaly_score) as avg_anomaly_score,
  array_agg(DISTINCT anomaly_type) as anomaly_types
FROM behavioral_anomaly
WHERE zone_id IS NOT NULL AND detected_at >= NOW() - INTERVAL '30 days'
GROUP BY tenant_id, zone_id, DATE(detected_at);

CREATE INDEX idx_mv_zone_anomaly_summary 
ON mv_zone_anomaly_summary (tenant_id, zone_id, detection_date DESC);

-- =====================================================
-- REFRESH MATERIALIZED VIEWS (CRON JOB)
-- =====================================================
-- Run this periodically (e.g., every 15 minutes):
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_branch_risk_summary;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_zone_anomaly_summary;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
-- GRANT SELECT ON ALL MATERIALIZED VIEWS IN SCHEMA public TO app_user;

-- =====================================================
-- SAMPLE DATA FUNCTIONS
-- =====================================================

-- Function to calculate risk level from score
CREATE OR REPLACE FUNCTION get_risk_level(score NUMERIC)
RETURNS TEXT AS $$
BEGIN
  IF score >= 80 THEN RETURN 'critical';
  ELSIF score >= 60 THEN RETURN 'high';
  ELSIF score >= 40 THEN RETURN 'medium';
  ELSE RETURN 'low';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to calculate anomaly severity from score
CREATE OR REPLACE FUNCTION get_anomaly_severity(score NUMERIC)
RETURNS TEXT AS $$
BEGIN
  IF score >= 7 THEN RETURN 'critical';
  ELSIF score >= 5 THEN RETURN 'high';
  ELSIF score >= 3 THEN RETURN 'medium';
  ELSE RETURN 'low';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Verify all tables created
SELECT 
  'behavioral_observation' as table_name, COUNT(*) as row_count FROM behavioral_observation
UNION ALL SELECT 'behavioral_profile', COUNT(*) FROM behavioral_profile
UNION ALL SELECT 'behavioral_anomaly', COUNT(*) FROM behavioral_anomaly
UNION ALL SELECT 'security_risk_heatmap', COUNT(*) FROM security_risk_heatmap
UNION ALL SELECT 'patrol_plan', COUNT(*) FROM patrol_plan
UNION ALL SELECT 'patrol_checkpoint', COUNT(*) FROM patrol_checkpoint
UNION ALL SELECT 'security_incident_prediction', COUNT(*) FROM security_incident_prediction
UNION ALL SELECT 'security_intelligence_report', COUNT(*) FROM security_intelligence_report
UNION ALL SELECT 'security_ml_model_state', COUNT(*) FROM security_ml_model_state;

-- List all indexes
SELECT 
  schemaname,
  tablename, 
  indexname,
  indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND (
    tablename LIKE 'behavioral_%' OR 
    tablename LIKE 'security_%' OR
    tablename LIKE 'patrol_%'
  )
ORDER BY tablename, indexname;
