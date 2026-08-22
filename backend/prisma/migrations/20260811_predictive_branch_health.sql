-- =====================================================
-- Predictive Branch Health System
-- =====================================================
-- 
-- Implements failure prediction pipeline for recording failures
-- based on HDD degradation, network quality, camera instability,
-- storage exhaustion, and historical patterns.
--

-- Branch Health Snapshots (telemetry aggregation)
CREATE TABLE IF NOT EXISTS branch_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Recording telemetry
  recording_coverage DECIMAL(5,2),
  cameras_recording INTEGER,
  cameras_expected INTEGER,
  recording_gaps INTEGER,
  retention_days INTEGER,
  retention_target INTEGER,
  
  -- Storage telemetry
  storage_used_percent DECIMAL(5,2),
  storage_free_bytes BIGINT,
  storage_total_bytes BIGINT,
  storage_growth_rate_per_day BIGINT,
  storage_days_remaining INTEGER,
  
  -- HDD telemetry
  hdd_health_score INTEGER,
  hdd_temperature_c DECIMAL(5,2),
  hdd_reallocated_sectors INTEGER,
  hdd_pending_sectors INTEGER,
  hdd_read_errors INTEGER,
  hdd_write_errors INTEGER,
  hdd_power_on_hours INTEGER,
  hdd_smart_status VARCHAR(20),
  
  -- Network telemetry
  network_latency_ms DECIMAL(8,2),
  network_packet_loss_percent DECIMAL(5,2),
  network_jitter_ms DECIMAL(8,2),
  network_disconnect_count INTEGER,
  network_uptime_percent DECIMAL(5,2),
  
  -- Camera telemetry
  cameras_total INTEGER,
  cameras_offline INTEGER,
  cameras_reconnect_count_24h INTEGER,
  cameras_video_loss_count_24h INTEGER,
  cameras_instability_score DECIMAL(5,2),
  cameras_critical_offline INTEGER,
  
  -- DVR telemetry
  dvr_temperature_c DECIMAL(5,2),
  dvr_cpu_percent DECIMAL(5,2),
  dvr_memory_percent DECIMAL(5,2),
  dvr_uptime_hours DECIMAL(10,2),
  dvr_restart_count_24h INTEGER,
  dvr_recording_engine_state VARCHAR(20),
  
  -- Historical data
  historical_failures_30d INTEGER,
  historical_failures_90d INTEGER,
  historical_failures_365d INTEGER,
  historical_recovery_count INTEGER,
  historical_mtbf_hours DECIMAL(10,2),
  historical_last_failure_date TIMESTAMPTZ,
  
  -- Data quality
  data_quality_score DECIMAL(3,2),
  data_sources_available INTEGER,
  data_sources_total INTEGER,
  
  -- Full snapshot (JSONB for flexibility)
  snapshot_data JSONB NOT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_snapshots_branch_time ON branch_health_snapshots(branch_id, timestamp DESC);
CREATE INDEX idx_snapshots_tenant_time ON branch_health_snapshots(tenant_id, timestamp DESC);
CREATE INDEX idx_snapshots_timestamp ON branch_health_snapshots(timestamp DESC);

-- Branch Health Features (engineered features for prediction)
CREATE TABLE IF NOT EXISTS branch_health_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  
  -- HDD features
  hdd_health_score DECIMAL(5,2),
  hdd_degradation_rate_7d DECIMAL(10,6),
  hdd_degradation_rate_30d DECIMAL(10,6),
  hdd_temperature_trend DECIMAL(10,6),
  hdd_reallocated_sectors_trend DECIMAL(10,6),
  hdd_pending_sectors_trend DECIMAL(10,6),
  hdd_error_acceleration DECIMAL(10,6),
  
  -- Network features
  network_latency_trend DECIMAL(10,6),
  network_packet_loss_trend DECIMAL(10,6),
  network_disconnect_rate DECIMAL(10,6),
  network_degradation_score DECIMAL(5,2),
  network_stability DECIMAL(5,2),
  
  -- Camera features
  camera_instability_score DECIMAL(5,2),
  camera_offline_rate DECIMAL(5,4),
  camera_reconnect_frequency DECIMAL(5,4),
  camera_video_loss_rate DECIMAL(5,4),
  critical_camera_risk DECIMAL(5,2),
  
  -- Storage features
  storage_fill_rate DECIMAL(10,6),
  storage_exhaustion_days INTEGER,
  storage_retention_risk DECIMAL(5,4),
  storage_growth_acceleration DECIMAL(10,6),
  
  -- DVR features
  dvr_thermal_risk DECIMAL(5,2),
  dvr_resource_utilization DECIMAL(5,2),
  dvr_stability DECIMAL(5,2),
  dvr_restart_frequency INTEGER,
  
  -- Historical features
  failure_frequency_30d DECIMAL(10,6),
  failure_frequency_90d DECIMAL(10,6),
  failure_recency DECIMAL(5,4),
  component_failure_pattern DECIMAL(5,2),
  mtbf_days DECIMAL(10,2),
  
  -- Composite features
  overall_health_score DECIMAL(5,2),
  degradation_velocity DECIMAL(10,6),
  multi_component_risk DECIMAL(5,2),
  branch_complexity_factor DECIMAL(5,2),
  
  -- Full features (JSONB for flexibility)
  features_data JSONB NOT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_features_branch_time ON branch_health_features(branch_id, timestamp DESC);
CREATE INDEX idx_features_snapshot ON branch_health_features(snapshot_id);

-- Branch Risk Predictions (prediction results)
CREATE TABLE IF NOT EXISTS branch_risk_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  
  -- Prediction target and horizon
  target VARCHAR(50) NOT NULL CHECK (target IN (
    'RECORDING_FAILURE', 'HDD_FAILURE', 'NETWORK_FAILURE', 
    'STORAGE_EXHAUSTION', 'CAMERA_FAILURE', 'DVR_FAILURE'
  )),
  horizon_hours INTEGER NOT NULL,
  
  -- Prediction results
  probability DECIMAL(5,4) NOT NULL CHECK (probability >= 0 AND probability <= 1),
  risk_level VARCHAR(20) NOT NULL CHECK (risk_level IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'HEALTHY')),
  confidence VARCHAR(20) NOT NULL CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
  data_quality DECIMAL(3,2) NOT NULL CHECK (data_quality >= 0 AND data_quality <= 1),
  
  -- Predicted failure window
  predicted_window_start TIMESTAMPTZ,
  predicted_window_end TIMESTAMPTZ,
  predicted_window_most_likely TIMESTAMPTZ,
  
  -- Primary risk drivers
  primary_risk_driver VARCHAR(100),
  secondary_risk_drivers TEXT[],
  
  -- Model information
  model_version VARCHAR(50) NOT NULL,
  model_type VARCHAR(20) NOT NULL CHECK (model_type IN ('RULES', 'ML', 'HYBRID')),
  
  -- Full prediction (JSONB for complete data)
  prediction_data JSONB NOT NULL,
  
  -- Lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  superseded_by UUID REFERENCES branch_risk_predictions(id)
);

CREATE INDEX idx_predictions_branch ON branch_risk_predictions(branch_id, created_at DESC);
CREATE INDEX idx_predictions_tenant ON branch_risk_predictions(tenant_id, created_at DESC);
CREATE INDEX idx_predictions_active ON branch_risk_predictions(branch_id, horizon_hours, expires_at) 
  WHERE expires_at > NOW();
CREATE INDEX idx_predictions_risk_level ON branch_risk_predictions(risk_level, probability DESC) 
  WHERE expires_at > NOW();

-- Prediction Outcomes (ground truth tracking for model calibration)
CREATE TABLE IF NOT EXISTS prediction_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id UUID NOT NULL REFERENCES branch_risk_predictions(id),
  branch_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  
  -- Prediction details (denormalized for analysis)
  predicted_at TIMESTAMPTZ NOT NULL,
  evaluated_at TIMESTAMPTZ NOT NULL,
  prediction_target VARCHAR(50) NOT NULL,
  prediction_horizon_hours INTEGER NOT NULL,
  prediction_probability DECIMAL(5,4) NOT NULL,
  prediction_risk_level VARCHAR(20) NOT NULL,
  prediction_confidence VARCHAR(20) NOT NULL,
  
  -- Actual outcome
  actual_failure BOOLEAN NOT NULL,
  actual_failure_time TIMESTAMPTZ,
  actual_failure_type VARCHAR(50),
  actual_root_cause TEXT,
  actual_affected_components TEXT[],
  
  -- Intervention (if any)
  intervention_action_taken BOOLEAN NOT NULL DEFAULT false,
  intervention_action_type VARCHAR(50),
  intervention_action_time TIMESTAMPTZ,
  intervention_prevented_failure BOOLEAN,
  
  -- Outcome classification
  outcome VARCHAR(30) NOT NULL CHECK (outcome IN (
    'TRUE_POSITIVE', 'FALSE_POSITIVE', 'TRUE_NEGATIVE', 
    'FALSE_NEGATIVE', 'INDETERMINATE'
  )),
  
  -- Analysis
  probability_error DECIMAL(5,4),
  calibration_bucket VARCHAR(20),
  primary_risk_driver_correct BOOLEAN,
  analysis_notes TEXT,
  
  -- Full outcome data
  outcome_data JSONB NOT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_outcomes_prediction ON prediction_outcomes(prediction_id);
CREATE INDEX idx_outcomes_branch ON prediction_outcomes(branch_id, evaluated_at DESC);
CREATE INDEX idx_outcomes_model ON prediction_outcomes(
  (outcome_data->>'modelVersion'), 
  outcome, 
  evaluated_at DESC
);

-- Failure Events (labeled failures for training)
CREATE TABLE IF NOT EXISTS failure_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  
  -- Failure details
  failure_type VARCHAR(50) NOT NULL CHECK (failure_type IN (
    'RECORDING_FAILURE', 'HDD_FAILURE', 'NETWORK_FAILURE',
    'STORAGE_EXHAUSTION', 'CAMERA_FAILURE', 'DVR_FAILURE'
  )),
  occurred_at TIMESTAMPTZ NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  
  -- Severity and classification
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  root_cause TEXT,
  contributing_factors TEXT[],
  affected_components TEXT[],
  
  -- Impact assessment
  cameras_affected INTEGER,
  recording_loss_duration_minutes INTEGER,
  data_loss BOOLEAN DEFAULT false,
  
  -- Resolution
  resolution_action_taken TEXT,
  resolution_technician VARCHAR(100),
  resolution_time_minutes INTEGER,
  resolution_cost DECIMAL(10,2),
  
  -- Incident linkage
  incident_id UUID,
  
  -- Full event data
  event_data JSONB NOT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_failure_events_branch ON failure_events(branch_id, occurred_at DESC);
CREATE INDEX idx_failure_events_type ON failure_events(failure_type, occurred_at DESC);
CREATE INDEX idx_failure_events_tenant ON failure_events(tenant_id, occurred_at DESC);

-- Model Calibration Metrics (performance tracking)
CREATE TABLE IF NOT EXISTS prediction_model_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version VARCHAR(50) NOT NULL,
  model_type VARCHAR(20) NOT NULL,
  
  -- Evaluation period
  evaluation_start TIMESTAMPTZ NOT NULL,
  evaluation_end TIMESTAMPTZ NOT NULL,
  
  -- Sample counts
  total_predictions INTEGER NOT NULL,
  true_positives INTEGER NOT NULL,
  false_positives INTEGER NOT NULL,
  true_negatives INTEGER NOT NULL,
  false_negatives INTEGER NOT NULL,
  
  -- Performance metrics
  precision DECIMAL(5,4),
  recall DECIMAL(5,4),
  f1_score DECIMAL(5,4),
  accuracy DECIMAL(5,4),
  
  -- Calibration metrics
  brier_score DECIMAL(5,4),
  calibration_error DECIMAL(5,4),
  
  -- Metrics by horizon
  metrics_by_horizon JSONB,
  
  -- Calibration buckets
  calibration_by_bucket JSONB,
  
  -- Full metrics
  metrics_data JSONB NOT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_model_metrics_version ON prediction_model_metrics(model_version, created_at DESC);

-- Comments for documentation
COMMENT ON TABLE branch_health_snapshots IS 'Aggregated branch health telemetry snapshots for prediction input';
COMMENT ON TABLE branch_health_features IS 'Engineered features derived from health snapshots for ML/rules-based prediction';
COMMENT ON TABLE branch_risk_predictions IS 'Branch failure risk predictions with explainability and confidence scores';
COMMENT ON TABLE prediction_outcomes IS 'Ground truth outcomes for prediction validation and model calibration';
COMMENT ON TABLE failure_events IS 'Labeled failure events for training data and outcome validation';
COMMENT ON TABLE prediction_model_metrics IS 'Model performance metrics for monitoring and improvement';
