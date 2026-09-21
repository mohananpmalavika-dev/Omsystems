-- AI Analytics Dashboard Database Schema
-- 
-- Tables for AI capability metrics, ROI configuration, and performance tracking.
-- Supports 381 AI capabilities across 17 domains with comprehensive metrics.
-- 
-- Schema Version: 1.0
-- Created: 2026-09-21

-- =============================================================================
-- AI Capability Metrics Table
-- =============================================================================
-- Stores aggregated performance metrics for each AI capability
-- Granularity: tenant/capability/camera/hour

CREATE TABLE IF NOT EXISTS ai_capability_metrics (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  
  -- Capability identification
  capability_type VARCHAR(100) NOT NULL,
  capability_domain VARCHAR(50) NOT NULL,
  capability_stage VARCHAR(20),
  
  -- Location context
  camera_id UUID,
  branch_id UUID,
  zone_id UUID,
  region_id UUID,
  
  -- Performance metrics (counts)
  detections_count INT DEFAULT 0 CHECK (detections_count >= 0),
  true_positives INT DEFAULT 0 CHECK (true_positives >= 0),
  false_positives INT DEFAULT 0 CHECK (false_positives >= 0),
  false_negatives INT DEFAULT 0 CHECK (false_negatives >= 0),
  true_negatives INT DEFAULT 0 CHECK (true_negatives >= 0),
  
  -- Calculated metrics (percentages)
  accuracy_percent NUMERIC(5,2) CHECK (accuracy_percent >= 0 AND accuracy_percent <= 100),
  precision_percent NUMERIC(5,2) CHECK (precision_percent >= 0 AND precision_percent <= 100),
  recall_percent NUMERIC(5,2) CHECK (recall_percent >= 0 AND recall_percent <= 100),
  f1_score NUMERIC(5,4) CHECK (f1_score >= 0 AND f1_score <= 1),
  false_positive_rate NUMERIC(5,2) CHECK (false_positive_rate >= 0 AND false_positive_rate <= 100),
  false_negative_rate NUMERIC(5,2) CHECK (false_negative_rate >= 0 AND false_negative_rate <= 100),
  specificity NUMERIC(5,2) CHECK (specificity >= 0 AND specificity <= 100),
  
  -- Timing metrics (milliseconds)
  avg_inference_ms NUMERIC(10,2) CHECK (avg_inference_ms >= 0),
  min_inference_ms NUMERIC(10,2) CHECK (min_inference_ms >= 0),
  max_inference_ms NUMERIC(10,2) CHECK (max_inference_ms >= 0),
  p50_inference_ms NUMERIC(10,2) CHECK (p50_inference_ms >= 0),
  p95_inference_ms NUMERIC(10,2) CHECK (p95_inference_ms >= 0),
  p99_inference_ms NUMERIC(10,2) CHECK (p99_inference_ms >= 0),
  
  -- Business impact metrics
  incidents_detected INT DEFAULT 0 CHECK (incidents_detected >= 0),
  incidents_prevented INT DEFAULT 0 CHECK (incidents_prevented >= 0),
  investigation_time_saved_minutes INT DEFAULT 0 CHECK (investigation_time_saved_minutes >= 0),
  estimated_cost_avoided NUMERIC(12,2) DEFAULT 0 CHECK (estimated_cost_avoided >= 0),
  
  -- Metadata
  measured_at TIMESTAMP NOT NULL,
  measurement_period_hours INT DEFAULT 1 CHECK (measurement_period_hours > 0),
  data_quality_score NUMERIC(3,2) CHECK (data_quality_score >= 0 AND data_quality_score <= 1),
  
  -- Model information
  model_name VARCHAR(100),
  model_version VARCHAR(50),
  last_model_update TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Unique constraint to prevent duplicates
  CONSTRAINT uk_ai_metrics_tenant_capability_camera_time 
    UNIQUE (tenant_id, capability_type, camera_id, measured_at)
);

-- Indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_ai_metrics_tenant_capability 
  ON ai_capability_metrics(tenant_id, capability_type, measured_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_metrics_domain 
  ON ai_capability_metrics(tenant_id, capability_domain, measured_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_metrics_camera 
  ON ai_capability_metrics(camera_id, measured_at DESC) 
  WHERE camera_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_metrics_branch 
  ON ai_capability_metrics(branch_id, measured_at DESC) 
  WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_metrics_measured 
  ON ai_capability_metrics(tenant_id, measured_at DESC);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_ai_metrics_performance 
  ON ai_capability_metrics(tenant_id, capability_domain, capability_type, measured_at DESC);

-- Index for time-series queries
CREATE INDEX IF NOT EXISTS idx_ai_metrics_timeseries 
  ON ai_capability_metrics(capability_type, measured_at DESC) 
  WHERE tenant_id IS NOT NULL;

-- Comments
COMMENT ON TABLE ai_capability_metrics IS 'Aggregated AI capability performance metrics by tenant/capability/camera/hour';
COMMENT ON COLUMN ai_capability_metrics.accuracy_percent IS '(TP + TN) / (TP + TN + FP + FN) * 100';
COMMENT ON COLUMN ai_capability_metrics.precision_percent IS 'TP / (TP + FP) * 100';
COMMENT ON COLUMN ai_capability_metrics.recall_percent IS 'TP / (TP + FN) * 100';
COMMENT ON COLUMN ai_capability_metrics.f1_score IS '2 * (precision * recall) / (precision + recall)';

-- =============================================================================
-- AI ROI Configuration Table
-- =============================================================================
-- Stores tenant-specific ROI calculation parameters

CREATE TABLE IF NOT EXISTS ai_roi_configuration (
  tenant_id UUID PRIMARY KEY,
  
  -- Cost assumptions (in USD)
  manual_monitoring_cost_per_hour NUMERIC(10,2) DEFAULT 35.00 CHECK (manual_monitoring_cost_per_hour >= 0),
  incident_prevention_value NUMERIC(10,2) DEFAULT 75.00 CHECK (incident_prevention_value >= 0),
  investigation_time_value_per_hour NUMERIC(10,2) DEFAULT 35.00 CHECK (investigation_time_value_per_hour >= 0),
  
  -- Investment costs (one-time)
  platform_license_annual NUMERIC(12,2) DEFAULT 120000.00 CHECK (platform_license_annual >= 0),
  model_training_initial NUMERIC(12,2) DEFAULT 45000.00 CHECK (model_training_initial >= 0),
  infrastructure_initial NUMERIC(12,2) DEFAULT 80000.00 CHECK (infrastructure_initial >= 0),
  integration_initial NUMERIC(12,2) DEFAULT 35000.00 CHECK (integration_initial >= 0),
  
  -- Operating costs (annual recurring)
  cloud_computing_annual NUMERIC(12,2) DEFAULT 36000.00 CHECK (cloud_computing_annual >= 0),
  model_maintenance_annual NUMERIC(12,2) DEFAULT 24000.00 CHECK (model_maintenance_annual >= 0),
  support_training_annual NUMERIC(12,2) DEFAULT 15000.00 CHECK (support_training_annual >= 0),
  
  -- Financial parameters
  discount_rate NUMERIC(5,4) DEFAULT 0.08 CHECK (discount_rate >= 0 AND discount_rate <= 1),
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE ai_roi_configuration IS 'Tenant-specific ROI calculation parameters';
COMMENT ON COLUMN ai_roi_configuration.discount_rate IS 'NPV discount rate (e.g., 0.08 = 8%)';

-- =============================================================================
-- AI Capability Catalog (Static Reference)
-- =============================================================================
-- Reference table for all 381 AI capabilities

CREATE TABLE IF NOT EXISTS ai_capability_catalog (
  id SERIAL PRIMARY KEY,
  capability_type VARCHAR(100) UNIQUE NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  description TEXT,
  capability_domain VARCHAR(50) NOT NULL,
  capability_stage VARCHAR(20) NOT NULL CHECK (capability_stage IN ('core', 'open-model', 'derived')),
  
  -- Model information
  default_model_name VARCHAR(100),
  model_architecture VARCHAR(100),
  model_description TEXT,
  
  -- Requirements
  requires_calibration BOOLEAN DEFAULT FALSE,
  requires_zones BOOLEAN DEFAULT FALSE,
  requires_configuration BOOLEAN DEFAULT FALSE,
  min_confidence_threshold NUMERIC(3,2) CHECK (min_confidence_threshold >= 0 AND min_confidence_threshold <= 1),
  
  -- Default severity
  default_severity VARCHAR(10) CHECK (default_severity IN ('P1', 'P2', 'P3', 'P4', 'P5')),
  
  -- Documentation
  documentation_url TEXT,
  setup_guide_url TEXT,
  
  -- Metadata
  introduced_version VARCHAR(20),
  deprecated BOOLEAN DEFAULT FALSE,
  deprecated_reason TEXT,
  replacement_capability VARCHAR(100),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capability_catalog_domain 
  ON ai_capability_catalog(capability_domain);

CREATE INDEX IF NOT EXISTS idx_capability_catalog_stage 
  ON ai_capability_catalog(capability_stage);

CREATE INDEX IF NOT EXISTS idx_capability_catalog_active 
  ON ai_capability_catalog(capability_type) 
  WHERE deprecated = FALSE;

COMMENT ON TABLE ai_capability_catalog IS 'Static reference catalog of all 381 AI capabilities';

-- =============================================================================
-- AI Capability Deployment Tracking
-- =============================================================================
-- Tracks which capabilities are deployed on which cameras

CREATE TABLE IF NOT EXISTS ai_capability_deployment (
  id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  capability_type VARCHAR(100) NOT NULL,
  camera_id UUID,
  branch_id UUID,
  
  -- Deployment info
  activated_at TIMESTAMP DEFAULT NOW(),
  deactivated_at TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Configuration (JSON for flexibility)
  configuration JSONB,
  confidence_threshold NUMERIC(3,2) CHECK (confidence_threshold >= 0 AND confidence_threshold <= 1),
  zones JSONB,
  
  -- Performance tracking
  total_detections BIGINT DEFAULT 0 CHECK (total_detections >= 0),
  last_detection_at TIMESTAMP,
  avg_daily_detections INT,
  
  -- Metadata
  deployed_by UUID,
  deployment_notes TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deployment_tenant_capability 
  ON ai_capability_deployment(tenant_id, capability_type, is_active);

CREATE INDEX IF NOT EXISTS idx_deployment_camera 
  ON ai_capability_deployment(camera_id, is_active) 
  WHERE camera_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deployment_branch 
  ON ai_capability_deployment(branch_id, is_active) 
  WHERE branch_id IS NOT NULL;

COMMENT ON TABLE ai_capability_deployment IS 'Tracks AI capability deployments per camera';

-- =============================================================================
-- AI Model Versions
-- =============================================================================
-- Tracks AI model versions and their performance benchmarks

CREATE TABLE IF NOT EXISTS ai_model_versions (
  id SERIAL PRIMARY KEY,
  model_name VARCHAR(100) NOT NULL,
  version VARCHAR(50) NOT NULL,
  capability_type VARCHAR(100),
  
  -- Model details
  architecture VARCHAR(100),
  framework VARCHAR(50) CHECK (framework IN ('tensorflow', 'pytorch', 'onnx', 'openvino')),
  model_size_mb INT CHECK (model_size_mb > 0),
  input_resolution VARCHAR(20),
  
  -- Performance benchmarks
  benchmark_accuracy NUMERIC(5,2) CHECK (benchmark_accuracy >= 0 AND benchmark_accuracy <= 100),
  benchmark_fp_rate NUMERIC(5,2) CHECK (benchmark_fp_rate >= 0 AND benchmark_fp_rate <= 100),
  benchmark_inference_ms NUMERIC(10,2) CHECK (benchmark_inference_ms >= 0),
  benchmark_dataset VARCHAR(200),
  
  -- Training info
  trained_date TIMESTAMP,
  training_dataset_size INT CHECK (training_dataset_size > 0),
  training_epochs INT CHECK (training_epochs > 0),
  training_duration_hours INT CHECK (training_duration_hours > 0),
  
  -- Deployment
  deployed_at TIMESTAMP,
  deprecated_at TIMESTAMP,
  is_current BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  release_notes TEXT,
  changelog TEXT,
  created_by UUID,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(model_name, version)
);

CREATE INDEX IF NOT EXISTS idx_model_versions_current 
  ON ai_model_versions(model_name, is_current) 
  WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_model_versions_capability 
  ON ai_model_versions(capability_type) 
  WHERE capability_type IS NOT NULL;

COMMENT ON TABLE ai_model_versions IS 'AI model version tracking with benchmarks';

-- =============================================================================
-- Materialized Views for Performance
-- =============================================================================

-- Daily aggregated metrics (fast dashboard queries)
CREATE MATERIALIZED VIEW IF NOT EXISTS ai_daily_metrics AS
SELECT 
  tenant_id,
  capability_domain,
  capability_type,
  DATE_TRUNC('day', measured_at) as date,
  COUNT(DISTINCT camera_id) as cameras_count,
  AVG(accuracy_percent) as avg_accuracy,
  AVG(precision_percent) as avg_precision,
  AVG(recall_percent) as avg_recall,
  SUM(detections_count) as total_detections,
  SUM(true_positives) as total_true_positives,
  SUM(false_positives) as total_false_positives,
  SUM(false_negatives) as total_false_negatives,
  AVG(avg_inference_ms) as avg_inference_time,
  SUM(incidents_detected) as total_incidents_detected,
  SUM(incidents_prevented) as total_incidents_prevented,
  SUM(investigation_time_saved_minutes) as total_time_saved_minutes,
  SUM(estimated_cost_avoided) as total_cost_avoided
FROM ai_capability_metrics
GROUP BY tenant_id, capability_domain, capability_type, DATE_TRUNC('day', measured_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_daily_metrics_unique 
  ON ai_daily_metrics(tenant_id, capability_domain, capability_type, date);

COMMENT ON MATERIALIZED VIEW ai_daily_metrics IS 'Daily aggregated AI metrics for fast queries';

-- Domain-level summary (for overview page)
CREATE MATERIALIZED VIEW IF NOT EXISTS ai_domain_summary AS
SELECT 
  tenant_id,
  capability_domain,
  COUNT(DISTINCT capability_type) as capabilities_count,
  COUNT(DISTINCT camera_id) as cameras_count,
  AVG(accuracy_percent) as avg_accuracy,
  SUM(detections_count) as total_detections,
  SUM(false_positives) as total_false_positives,
  CASE 
    WHEN SUM(detections_count) > 0 
    THEN (SUM(false_positives)::NUMERIC / SUM(detections_count) * 100)
    ELSE 0
  END as false_positive_rate,
  SUM(incidents_prevented) as total_incidents_prevented,
  SUM(estimated_cost_avoided) as total_cost_avoided,
  MAX(measured_at) as last_updated
FROM ai_capability_metrics
WHERE measured_at >= NOW() - INTERVAL '30 days'
GROUP BY tenant_id, capability_domain;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_domain_summary_unique 
  ON ai_domain_summary(tenant_id, capability_domain);

COMMENT ON MATERIALIZED VIEW ai_domain_summary IS 'Domain-level summary for overview dashboard';

-- =============================================================================
-- Functions for Materialized View Refresh
-- =============================================================================

-- Refresh daily metrics
CREATE OR REPLACE FUNCTION refresh_ai_daily_metrics()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY ai_daily_metrics;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_ai_daily_metrics() IS 'Refresh daily metrics materialized view';

-- Refresh domain summary
CREATE OR REPLACE FUNCTION refresh_ai_domain_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY ai_domain_summary;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_ai_domain_summary() IS 'Refresh domain summary materialized view';

-- Refresh all AI analytics views
CREATE OR REPLACE FUNCTION refresh_all_ai_analytics_views()
RETURNS void AS $$
BEGIN
  PERFORM refresh_ai_daily_metrics();
  PERFORM refresh_ai_domain_summary();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_all_ai_analytics_views() IS 'Refresh all AI analytics materialized views';

-- =============================================================================
-- Grant Permissions
-- =============================================================================

-- Grant read access to application user (adjust role name as needed)
-- GRANT SELECT ON ai_capability_metrics TO app_user;
-- GRANT SELECT ON ai_roi_configuration TO app_user;
-- GRANT SELECT ON ai_capability_catalog TO app_user;
-- GRANT SELECT ON ai_capability_deployment TO app_user;
-- GRANT SELECT ON ai_model_versions TO app_user;
-- GRANT SELECT ON ai_daily_metrics TO app_user;
-- GRANT SELECT ON ai_domain_summary TO app_user;

-- Grant insert for metrics ingestion
-- GRANT INSERT, UPDATE ON ai_capability_metrics TO app_user;
-- GRANT USAGE, SELECT ON SEQUENCE ai_capability_metrics_id_seq TO app_user;

-- =============================================================================
-- Sample Data (Optional - for testing)
-- =============================================================================

-- Insert sample ROI configuration for testing
-- INSERT INTO ai_roi_configuration (tenant_id) 
-- VALUES ('00000000-0000-0000-0000-000000000000')
-- ON CONFLICT (tenant_id) DO NOTHING;

-- Migration complete
COMMENT ON SCHEMA public IS 'AI Analytics Dashboard - Schema Version 1.0 - 2026-09-21';
