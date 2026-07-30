-- ============================================================================
-- PREDICTIVE BRANCH FAILURE - AI-Powered Failure Prediction System
-- ============================================================================
-- This migration implements the database schema for predictive branch failure
-- detection, including telemetry storage, prediction tracking, evidence 
-- collection, outcome validation, and branch risk scoring.
--
-- Key Features:
-- - Time-series telemetry storage for trend analysis
-- - Rule-based failure prediction with evidence tracking
-- - Branch risk score aggregation
-- - Prediction outcome tracking and calibration
-- - Maintenance work order integration
-- ============================================================================

-- ============================================================================
-- ENUMS AND TYPES
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE prediction_type AS ENUM (
    'recorder_failure',
    'disk_failure',
    'network_failure',
    'camera_failure',
    'ups_failure',
    'storage_retention_failure'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE risk_classification AS ENUM (
    'monitor',           -- <40% probability
    'emerging_risk',     -- 40-65% probability
    'high_risk',         -- 65-80% probability
    'critical_risk',     -- 80-95% probability
    'imminent_failure'   -- >95% probability
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE prediction_confidence AS ENUM (
    'low',
    'medium',
    'high'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE prediction_status AS ENUM (
    'active',
    'acknowledged',
    'resolved',
    'expired',
    'false_positive'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE prediction_outcome AS ENUM (
    'pending',
    'correct',           -- Failure occurred as predicted
    'false_positive',    -- Predicted but did not fail
    'false_negative',    -- Failed but was not predicted
    'prevented'          -- Maintenance prevented failure
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- DEVICE HEALTH SNAPSHOTS
-- ============================================================================
-- Stores periodic health assessments for devices

CREATE TABLE IF NOT EXISTS device_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Device identification
  device_id text NOT NULL,
  device_type text NOT NULL CHECK (device_type IN ('recorder', 'disk', 'camera', 'network', 'ups')),
  branch_node_id uuid REFERENCES resource_nodes(id),
  
  -- Health metrics
  snapshot_timestamp timestamptz NOT NULL DEFAULT now(),
  health_score integer NOT NULL CHECK (health_score BETWEEN 0 AND 100),
  
  -- Raw metrics (stored as JSONB for flexibility)
  metrics jsonb NOT NULL,
  
  -- Derived features
  degradation_rate numeric(10,4), -- Health score change per day
  anomaly_score numeric(5,4), -- 0-1, higher indicates anomaly
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT device_health_snapshots_unique UNIQUE (tenant_id, device_id, snapshot_timestamp)
);

CREATE INDEX device_health_snapshots_device_idx 
  ON device_health_snapshots (tenant_id, device_id, snapshot_timestamp DESC);
CREATE INDEX device_health_snapshots_branch_idx 
  ON device_health_snapshots (branch_node_id, snapshot_timestamp DESC);
CREATE INDEX device_health_snapshots_health_idx 
  ON device_health_snapshots (health_score ASC, snapshot_timestamp DESC)
  WHERE health_score < 60;

-- ============================================================================
-- DEVICE HEALTH FEATURES
-- ============================================================================
-- Stores extracted features for prediction models

CREATE TABLE IF NOT EXISTS device_health_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  device_id text NOT NULL,
  device_type text NOT NULL,
  
  -- Feature extraction timestamp
  extracted_at timestamptz NOT NULL DEFAULT now(),
  
  -- Time-series features
  moving_avg_7d numeric(10,4),
  moving_avg_30d numeric(10,4),
  trend_slope numeric(10,6), -- Health change rate
  trend_direction text CHECK (trend_direction IN ('improving', 'stable', 'degrading')),
  
  -- Statistical features
  std_dev numeric(10,4),
  variance numeric(10,4),
  min_value numeric(10,4),
  max_value numeric(10,4),
  
  -- Domain-specific features (JSONB for flexibility)
  features jsonb NOT NULL,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT device_health_features_unique UNIQUE (tenant_id, device_id, extracted_at)
);

CREATE INDEX device_health_features_device_idx 
  ON device_health_features (tenant_id, device_id, extracted_at DESC);
CREATE INDEX device_health_features_trend_idx 
  ON device_health_features (trend_direction, extracted_at DESC)
  WHERE trend_direction = 'degrading';

-- ============================================================================
-- DEVICE FAILURE EVENTS
-- ============================================================================
-- Stores confirmed device failures for training and validation

CREATE TABLE IF NOT EXISTS device_failure_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  device_id text NOT NULL,
  device_type text NOT NULL,
  branch_node_id uuid REFERENCES resource_nodes(id),
  
  -- Failure details
  failure_timestamp timestamptz NOT NULL,
  failure_type text NOT NULL,
  failure_cause text,
  
  -- Impact assessment
  cameras_affected integer,
  recording_interrupted boolean DEFAULT false,
  compliance_affected boolean DEFAULT false,
  downtime_minutes integer,
  
  -- Resolution
  resolved_at timestamptz,
  resolution_method text,
  
  -- Metadata
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX device_failure_events_device_idx 
  ON device_failure_events (tenant_id, device_id, failure_timestamp DESC);
CREATE INDEX device_failure_events_branch_idx 
  ON device_failure_events (branch_node_id, failure_timestamp DESC);
CREATE INDEX device_failure_events_type_idx 
  ON device_failure_events (device_type, failure_type, failure_timestamp DESC);

-- ============================================================================
-- FAILURE PREDICTIONS
-- ============================================================================
-- Stores active and historical failure predictions

CREATE TABLE IF NOT EXISTS failure_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Target device/component
  device_id text NOT NULL,
  device_type text NOT NULL,
  branch_node_id uuid REFERENCES resource_nodes(id),
  
  -- Prediction details
  prediction_type prediction_type NOT NULL,
  probability numeric(5,4) NOT NULL CHECK (probability BETWEEN 0 AND 1),
  confidence prediction_confidence NOT NULL,
  risk_classification risk_classification NOT NULL,
  
  -- Time-to-failure prediction
  predicted_at timestamptz NOT NULL DEFAULT now(),
  expected_failure_from timestamptz NOT NULL,
  expected_failure_to timestamptz NOT NULL,
  time_horizon_days integer NOT NULL,
  
  -- Impact assessment
  predicted_impact jsonb NOT NULL, -- {cameras: int, recordingAtRisk: bool, complianceAtRisk: bool, estimatedDowntime: int}
  
  -- Recommendations
  recommended_action text NOT NULL,
  preventive_actions text[],
  
  -- Model information
  model_version text NOT NULL,
  prediction_method text NOT NULL, -- 'rule-based', 'statistical', 'ml'
  
  -- Status tracking
  status prediction_status NOT NULL DEFAULT 'active',
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES users(id),
  
  -- Metadata
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX failure_predictions_device_idx 
  ON failure_predictions (tenant_id, device_id, predicted_at DESC);
CREATE INDEX failure_predictions_branch_idx 
  ON failure_predictions (branch_node_id, predicted_at DESC);
CREATE INDEX failure_predictions_status_idx 
  ON failure_predictions (status, risk_classification, predicted_at DESC);
CREATE INDEX failure_predictions_imminent_idx 
  ON failure_predictions (expected_failure_from)
  WHERE status = 'active' AND risk_classification IN ('critical_risk', 'imminent_failure');
CREATE INDEX failure_predictions_type_idx 
  ON failure_predictions (prediction_type, status, predicted_at DESC);

-- ============================================================================
-- PREDICTION EVIDENCE
-- ============================================================================
-- Stores individual evidence items supporting predictions

CREATE TABLE IF NOT EXISTS prediction_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id uuid NOT NULL REFERENCES failure_predictions(id) ON DELETE CASCADE,
  
  -- Evidence details
  evidence_type text NOT NULL, -- 'temperature_trend', 'restart_frequency', 'latency_increase', etc.
  evidence_description text NOT NULL,
  
  -- Evidence data
  metric_name text NOT NULL,
  current_value numeric(15,4),
  baseline_value numeric(15,4),
  change_percentage numeric(8,2),
  
  -- Time series data for trend visualization
  trend_data jsonb, -- [{timestamp: ISO, value: number}, ...]
  
  -- Evidence weight/importance
  weight numeric(5,4) NOT NULL DEFAULT 1.0 CHECK (weight BETWEEN 0 AND 1),
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX prediction_evidence_prediction_idx 
  ON prediction_evidence (prediction_id);
CREATE INDEX prediction_evidence_type_idx 
  ON prediction_evidence (evidence_type, created_at DESC);

-- ============================================================================
-- PREDICTION OUTCOMES
-- ============================================================================
-- Tracks whether predictions were accurate

CREATE TABLE IF NOT EXISTS prediction_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id uuid NOT NULL REFERENCES failure_predictions(id) ON DELETE CASCADE,
  
  -- Outcome determination
  outcome prediction_outcome NOT NULL,
  outcome_determined_at timestamptz NOT NULL DEFAULT now(),
  
  -- Failure event reference (if failure occurred)
  failure_event_id uuid REFERENCES device_failure_events(id),
  
  -- Timing accuracy
  failure_occurred_at timestamptz,
  prediction_lead_time_hours numeric(8,2), -- Time between prediction and failure
  within_predicted_window boolean,
  
  -- Analysis
  accuracy_notes text,
  lessons_learned text,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX prediction_outcomes_prediction_idx 
  ON prediction_outcomes (prediction_id);
CREATE INDEX prediction_outcomes_outcome_idx 
  ON prediction_outcomes (outcome, outcome_determined_at DESC);
CREATE INDEX prediction_outcomes_accuracy_idx 
  ON prediction_outcomes (within_predicted_window, prediction_lead_time_hours);

-- ============================================================================
-- PREDICTION FEEDBACK
-- ============================================================================
-- Stores operator feedback on predictions

CREATE TABLE IF NOT EXISTS prediction_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id uuid NOT NULL REFERENCES failure_predictions(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Feedback source
  provided_by uuid NOT NULL REFERENCES users(id),
  provided_at timestamptz NOT NULL DEFAULT now(),
  
  -- Feedback content
  feedback_type text NOT NULL CHECK (feedback_type IN ('helpful', 'not_helpful', 'incorrect', 'too_early', 'too_late')),
  accuracy_rating integer CHECK (accuracy_rating BETWEEN 1 AND 5),
  usefulness_rating integer CHECK (usefulness_rating BETWEEN 1 AND 5),
  
  comments text,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX prediction_feedback_prediction_idx 
  ON prediction_feedback (prediction_id);
CREATE INDEX prediction_feedback_user_idx 
  ON prediction_feedback (provided_by, provided_at DESC);

-- ============================================================================
-- BRANCH RISK SCORES
-- ============================================================================
-- Stores composite branch reliability scores

CREATE TABLE IF NOT EXISTS branch_risk_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_node_id uuid NOT NULL REFERENCES resource_nodes(id),
  
  -- Composite score
  calculated_at timestamptz NOT NULL DEFAULT now(),
  overall_score integer NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  overall_classification risk_classification NOT NULL,
  
  -- Component scores
  recorder_risk_score integer CHECK (recorder_risk_score BETWEEN 0 AND 100),
  storage_risk_score integer CHECK (storage_risk_score BETWEEN 0 AND 100),
  network_risk_score integer CHECK (network_risk_score BETWEEN 0 AND 100),
  power_risk_score integer CHECK (power_risk_score BETWEEN 0 AND 100),
  camera_risk_score integer CHECK (camera_risk_score BETWEEN 0 AND 100),
  compliance_risk_score integer CHECK (compliance_risk_score BETWEEN 0 AND 100),
  
  -- Risk factors
  active_predictions_count integer NOT NULL DEFAULT 0,
  critical_predictions_count integer NOT NULL DEFAULT 0,
  redundancy_weakness_score integer,
  historical_incident_frequency numeric(8,4),
  
  -- Recommendations
  top_risks text[],
  recommended_actions text[],
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX branch_risk_scores_branch_idx 
  ON branch_risk_scores (tenant_id, branch_node_id, calculated_at DESC);
CREATE INDEX branch_risk_scores_score_idx 
  ON branch_risk_scores (overall_score ASC, calculated_at DESC)
  WHERE overall_score < 60;
CREATE INDEX branch_risk_scores_classification_idx 
  ON branch_risk_scores (overall_classification, calculated_at DESC);

-- ============================================================================
-- PREDICTION MODELS
-- ============================================================================
-- Stores prediction model configurations and versions

CREATE TABLE IF NOT EXISTS prediction_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE, -- NULL for global models
  
  model_name text NOT NULL,
  model_version text NOT NULL,
  model_type text NOT NULL CHECK (model_type IN ('rule-based', 'statistical', 'ml')),
  
  -- Model configuration
  prediction_type prediction_type NOT NULL,
  configuration jsonb NOT NULL,
  
  -- Performance metrics
  accuracy numeric(5,4),
  precision numeric(5,4),
  recall numeric(5,4),
  f1_score numeric(5,4),
  false_positive_rate numeric(5,4),
  
  -- Status
  is_active boolean NOT NULL DEFAULT true,
  deployed_at timestamptz,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT prediction_models_unique UNIQUE (model_name, model_version)
);

CREATE INDEX prediction_models_type_idx 
  ON prediction_models (prediction_type, is_active);
CREATE INDEX prediction_models_active_idx 
  ON prediction_models (is_active, deployed_at DESC);

-- ============================================================================
-- PREDICTION RUNS
-- ============================================================================
-- Tracks prediction generation executions

CREATE TABLE IF NOT EXISTS prediction_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  run_type text NOT NULL CHECK (run_type IN ('scheduled', 'manual', 'trigger-based')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  
  -- Execution details
  devices_analyzed integer NOT NULL DEFAULT 0,
  predictions_generated integer NOT NULL DEFAULT 0,
  predictions_updated integer NOT NULL DEFAULT 0,
  predictions_expired integer NOT NULL DEFAULT 0,
  
  -- Performance
  execution_time_ms integer,
  
  -- Status
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  error_message text,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX prediction_runs_tenant_idx 
  ON prediction_runs (tenant_id, started_at DESC);
CREATE INDEX prediction_runs_status_idx 
  ON prediction_runs (status, started_at DESC);

-- ============================================================================
-- MAINTENANCE INTERVENTIONS
-- ============================================================================
-- Links predictions to maintenance actions

CREATE TABLE IF NOT EXISTS maintenance_interventions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  prediction_id uuid NOT NULL REFERENCES failure_predictions(id),
  
  -- Work order reference (if maintenance_work_orders exists)
  work_order_id uuid,
  
  -- Intervention details
  intervention_type text NOT NULL CHECK (intervention_type IN ('preventive', 'corrective', 'deferred', 'monitoring')),
  scheduled_at timestamptz,
  completed_at timestamptz,
  
  -- Personnel
  assigned_to uuid REFERENCES users(id),
  completed_by uuid REFERENCES users(id),
  
  -- Results
  action_taken text,
  parts_replaced text[],
  cost numeric(12,2),
  downtime_minutes integer,
  
  -- Outcome
  failure_prevented boolean,
  notes text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX maintenance_interventions_prediction_idx 
  ON maintenance_interventions (prediction_id);
CREATE INDEX maintenance_interventions_schedule_idx 
  ON maintenance_interventions (scheduled_at)
  WHERE completed_at IS NULL;
CREATE INDEX maintenance_interventions_work_order_idx 
  ON maintenance_interventions (work_order_id)
  WHERE work_order_id IS NOT NULL;

-- ============================================================================
-- RISK SUPPRESSION RULES
-- ============================================================================
-- Operator-defined exceptions to prediction rules

CREATE TABLE IF NOT EXISTS risk_suppression_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Rule scope
  rule_name text NOT NULL,
  device_id text,
  device_type text,
  branch_node_id uuid REFERENCES resource_nodes(id),
  prediction_type prediction_type,
  
  -- Suppression logic
  suppress_until timestamptz,
  reason text NOT NULL,
  
  -- Audit
  created_by uuid NOT NULL REFERENCES users(id),
  is_active boolean NOT NULL DEFAULT true,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX risk_suppression_rules_device_idx 
  ON risk_suppression_rules (tenant_id, device_id, is_active);
CREATE INDEX risk_suppression_rules_branch_idx 
  ON risk_suppression_rules (branch_node_id, is_active);
CREATE INDEX risk_suppression_rules_expiry_idx 
  ON risk_suppression_rules (suppress_until)
  WHERE is_active = true AND suppress_until IS NOT NULL;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active Predictions Summary View
CREATE OR REPLACE VIEW active_predictions_summary AS
SELECT 
  fp.id,
  fp.tenant_id,
  fp.device_id,
  fp.device_type,
  fp.branch_node_id,
  rn.name as branch_name,
  fp.prediction_type,
  fp.probability,
  fp.confidence,
  fp.risk_classification,
  fp.expected_failure_from,
  fp.expected_failure_to,
  fp.predicted_impact,
  fp.recommended_action,
  fp.status,
  fp.predicted_at,
  EXTRACT(EPOCH FROM (fp.expected_failure_from - NOW())) / 3600 as hours_until_failure,
  COUNT(pe.id) as evidence_count,
  CASE 
    WHEN fp.expected_failure_from <= NOW() + INTERVAL '24 hours' THEN true 
    ELSE false 
  END as is_imminent
FROM failure_predictions fp
LEFT JOIN resource_nodes rn ON rn.id = fp.branch_node_id
LEFT JOIN prediction_evidence pe ON pe.prediction_id = fp.id
WHERE fp.status = 'active'
GROUP BY fp.id, rn.name;

-- Branch Risk Summary View
CREATE OR REPLACE VIEW branch_risk_summary AS
SELECT 
  brs.tenant_id,
  brs.branch_node_id,
  rn.name as branch_name,
  brs.overall_score,
  brs.overall_classification,
  brs.recorder_risk_score,
  brs.storage_risk_score,
  brs.network_risk_score,
  brs.power_risk_score,
  brs.camera_risk_score,
  brs.compliance_risk_score,
  brs.active_predictions_count,
  brs.critical_predictions_count,
  brs.calculated_at,
  COUNT(fp.id) FILTER (WHERE fp.status = 'active') as current_active_predictions,
  COUNT(fp.id) FILTER (WHERE fp.risk_classification IN ('critical_risk', 'imminent_failure')) as current_critical_predictions
FROM branch_risk_scores brs
JOIN resource_nodes rn ON rn.id = brs.branch_node_id
LEFT JOIN failure_predictions fp ON fp.branch_node_id = brs.branch_node_id AND fp.status = 'active'
WHERE brs.id IN (
  SELECT DISTINCT ON (branch_node_id) id 
  FROM branch_risk_scores 
  ORDER BY branch_node_id, calculated_at DESC
)
GROUP BY brs.id, brs.tenant_id, brs.branch_node_id, rn.name, brs.overall_score, 
         brs.overall_classification, brs.recorder_risk_score, brs.storage_risk_score,
         brs.network_risk_score, brs.power_risk_score, brs.camera_risk_score,
         brs.compliance_risk_score, brs.active_predictions_count, 
         brs.critical_predictions_count, brs.calculated_at;

-- Prediction Accuracy Metrics View
CREATE OR REPLACE VIEW prediction_accuracy_metrics AS
SELECT 
  fp.tenant_id,
  fp.prediction_type,
  fp.model_version,
  COUNT(fp.id) as total_predictions,
  COUNT(po.id) FILTER (WHERE po.outcome = 'correct') as correct_predictions,
  COUNT(po.id) FILTER (WHERE po.outcome = 'false_positive') as false_positives,
  COUNT(po.id) FILTER (WHERE po.outcome = 'false_negative') as false_negatives,
  COUNT(po.id) FILTER (WHERE po.outcome = 'prevented') as prevented_failures,
  COUNT(po.id) FILTER (WHERE po.within_predicted_window = true) as within_window,
  AVG(po.prediction_lead_time_hours) FILTER (WHERE po.outcome = 'correct') as avg_lead_time_hours,
  CASE 
    WHEN COUNT(po.id) FILTER (WHERE po.outcome IN ('correct', 'false_positive')) > 0 
    THEN ROUND((COUNT(po.id) FILTER (WHERE po.outcome = 'correct')::numeric / 
                COUNT(po.id) FILTER (WHERE po.outcome IN ('correct', 'false_positive'))::numeric), 4)
    ELSE NULL 
  END as precision,
  CASE 
    WHEN COUNT(po.id) FILTER (WHERE po.outcome IN ('correct', 'false_negative')) > 0 
    THEN ROUND((COUNT(po.id) FILTER (WHERE po.outcome = 'correct')::numeric / 
                COUNT(po.id) FILTER (WHERE po.outcome IN ('correct', 'false_negative'))::numeric), 4)
    ELSE NULL 
  END as recall,
  DATE_TRUNC('day', fp.predicted_at) as prediction_date
FROM failure_predictions fp
LEFT JOIN prediction_outcomes po ON po.prediction_id = fp.id
WHERE fp.predicted_at >= NOW() - INTERVAL '90 days'
GROUP BY fp.tenant_id, fp.prediction_type, fp.model_version, DATE_TRUNC('day', fp.predicted_at);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to auto-expire old predictions
CREATE OR REPLACE FUNCTION expire_old_predictions()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE failure_predictions
  SET status = 'expired',
      updated_at = NOW()
  WHERE status = 'active'
    AND expected_failure_to < NOW() - INTERVAL '24 hours'
    AND NOT EXISTS (
      SELECT 1 FROM prediction_outcomes po 
      WHERE po.prediction_id = failure_predictions.id
    );
  
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate device health score from metrics
CREATE OR REPLACE FUNCTION calculate_health_score(device_metrics jsonb)
RETURNS INTEGER AS $$
DECLARE
  score INTEGER := 100;
BEGIN
  -- This is a simplified example - actual implementation would be more sophisticated
  -- Adjust score based on various metrics
  
  -- Temperature penalty
  IF (device_metrics->>'temperature')::numeric > 70 THEN
    score := score - 20;
  ELSIF (device_metrics->>'temperature')::numeric > 60 THEN
    score := score - 10;
  END IF;
  
  -- CPU usage penalty
  IF (device_metrics->>'cpu_usage')::numeric > 90 THEN
    score := score - 15;
  ELSIF (device_metrics->>'cpu_usage')::numeric > 75 THEN
    score := score - 7;
  END IF;
  
  -- Memory usage penalty
  IF (device_metrics->>'memory_usage')::numeric > 90 THEN
    score := score - 15;
  ELSIF (device_metrics->>'memory_usage')::numeric > 75 THEN
    score := score - 7;
  END IF;
  
  RETURN GREATEST(0, LEAST(100, score));
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER failure_predictions_updated_at
  BEFORE UPDATE ON failure_predictions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER prediction_models_updated_at
  BEFORE UPDATE ON prediction_models
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER maintenance_interventions_updated_at
  BEFORE UPDATE ON maintenance_interventions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER risk_suppression_rules_updated_at
  BEFORE UPDATE ON risk_suppression_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE device_health_snapshots IS 'Periodic health assessments for devices used in failure prediction';
COMMENT ON TABLE device_health_features IS 'Extracted features from device telemetry for prediction models';
COMMENT ON TABLE device_failure_events IS 'Confirmed device failures used for training and validation';
COMMENT ON TABLE failure_predictions IS 'Active and historical failure predictions with time-to-failure estimates';
COMMENT ON TABLE prediction_evidence IS 'Individual evidence items supporting each prediction';
COMMENT ON TABLE prediction_outcomes IS 'Tracks prediction accuracy and outcomes';
COMMENT ON TABLE prediction_feedback IS 'Operator feedback on prediction usefulness';
COMMENT ON TABLE branch_risk_scores IS 'Composite branch reliability scores aggregated from component risks';
COMMENT ON TABLE prediction_models IS 'Prediction model configurations and performance metrics';
COMMENT ON TABLE prediction_runs IS 'Tracks prediction generation execution history';
COMMENT ON TABLE maintenance_interventions IS 'Links predictions to preventive maintenance actions';
COMMENT ON TABLE risk_suppression_rules IS 'Operator-defined exceptions to prediction rules';

-- ============================================================================
-- DATA RETENTION POLICY
-- ============================================================================
-- Note: These are commented out - implement via pg_cron or application scheduler

-- Delete old health snapshots (keep 90 days)
-- SELECT cron.schedule('cleanup-health-snapshots', '0 3 * * *', $$
--   DELETE FROM device_health_snapshots 
--   WHERE snapshot_timestamp < NOW() - INTERVAL '90 days'
-- $$);

-- Delete old prediction runs (keep 1 year)
-- SELECT cron.schedule('cleanup-prediction-runs', '0 3 * * *', $$
--   DELETE FROM prediction_runs 
--   WHERE started_at < NOW() - INTERVAL '1 year'
-- $$);

-- Auto-expire old predictions daily
-- SELECT cron.schedule('expire-predictions', '0 * * * *', $$
--   SELECT expire_old_predictions()
-- $$);

-- ============================================================================
-- CALIBRATION HISTORY TABLE (Added for prediction accuracy tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS prediction_calibration_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    prediction_type prediction_type NOT NULL,
    measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accuracy DECIMAL(5,4) NOT NULL,
    precision_value DECIMAL(5,4) NOT NULL,
    recall_value DECIMAL(5,4) NOT NULL,
    f1_score DECIMAL(5,4) NOT NULL,
    false_positive_rate DECIMAL(5,4) NOT NULL,
    average_lead_time_hours DECIMAL(8,2),
    total_predictions INT NOT NULL,
    true_positives INT NOT NULL,
    false_positives INT NOT NULL,
    false_negatives INT NOT NULL,
    model_health VARCHAR(20) NOT NULL CHECK (model_health IN ('excellent', 'good', 'fair', 'poor')),
    calibration_curve JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_calibration_tenant ON prediction_calibration_history(tenant_id);
CREATE INDEX idx_calibration_type ON prediction_calibration_history(prediction_type);
CREATE INDEX idx_calibration_measured_at ON prediction_calibration_history(measured_at DESC);

COMMENT ON TABLE prediction_calibration_history IS 'Historical tracking of prediction model accuracy and calibration metrics';

-- ============================================================================
-- RCA INTEGRATION TABLES (Added for prediction outcome learning)
-- ============================================================================

CREATE TABLE IF NOT EXISTS prediction_misprediction_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_id UUID NOT NULL REFERENCES failure_predictions(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    prediction_type prediction_type NOT NULL,
    analysis JSONB NOT NULL,
    reviewed BOOLEAN NOT NULL DEFAULT false,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    action_taken TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_misprediction_prediction ON prediction_misprediction_log(prediction_id);
CREATE INDEX idx_misprediction_tenant ON prediction_misprediction_log(tenant_id);
CREATE INDEX idx_misprediction_type ON prediction_misprediction_log(prediction_type);
CREATE INDEX idx_misprediction_reviewed ON prediction_misprediction_log(reviewed) WHERE reviewed = false;

CREATE TABLE IF NOT EXISTS rca_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    case_fingerprint VARCHAR(24) NOT NULL,
    branch_node_id UUID NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    failure_type VARCHAR(100) NOT NULL,
    root_cause_code VARCHAR(100) NOT NULL,
    root_cause_label VARCHAR(255) NOT NULL,
    confidence DECIMAL(5,4) NOT NULL,
    evidence JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rca_cases_tenant ON rca_cases(tenant_id);
CREATE INDEX idx_rca_cases_branch ON rca_cases(branch_node_id);
CREATE INDEX idx_rca_cases_device ON rca_cases(device_id);
CREATE INDEX idx_rca_cases_fingerprint ON rca_cases(case_fingerprint);

COMMENT ON TABLE prediction_misprediction_log IS 'Tracks incorrect predictions for model improvement and rule adjustment';
COMMENT ON TABLE rca_cases IS 'Root cause analysis results linked to failure predictions for outcome learning';
