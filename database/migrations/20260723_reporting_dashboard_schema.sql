-- CCTV Reports & Executive Dashboard Schema
-- Module 2.11: Reporting Data Layer
-- Purpose: Store aggregated metrics, report definitions, and dashboard configurations

-- ============================================
-- Dashboard Definitions
-- ============================================
CREATE TABLE IF NOT EXISTS dashboard_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  description TEXT,
  target_role VARCHAR(100), -- control_room_operator, branch_manager, regional_security, etc.
  layout_config JSONB NOT NULL DEFAULT '{}', -- Widget positions and sizes
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, slug)
);

CREATE INDEX idx_dashboard_definitions_tenant ON dashboard_definitions(tenant_id);
CREATE INDEX idx_dashboard_definitions_role ON dashboard_definitions(target_role);

-- ============================================
-- Dashboard Widgets
-- ============================================
CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id UUID NOT NULL REFERENCES dashboard_definitions(id) ON DELETE CASCADE,
  widget_type VARCHAR(100) NOT NULL, -- camera_status, recording_status, storage, incidents, etc.
  title VARCHAR(255) NOT NULL,
  position_x INT NOT NULL DEFAULT 0,
  position_y INT NOT NULL DEFAULT 0,
  width INT NOT NULL DEFAULT 1,
  height INT NOT NULL DEFAULT 1,
  config JSONB NOT NULL DEFAULT '{}', -- Widget-specific configuration
  refresh_interval INT DEFAULT 60, -- Seconds
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_dashboard_widgets_dashboard ON dashboard_widgets(dashboard_id);
CREATE INDEX idx_dashboard_widgets_type ON dashboard_widgets(widget_type);

-- ============================================
-- Dashboard User Preferences
-- ============================================
CREATE TABLE IF NOT EXISTS dashboard_user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dashboard_id UUID NOT NULL REFERENCES dashboard_definitions(id) ON DELETE CASCADE,
  custom_layout JSONB, -- User-customized widget layout
  filters JSONB DEFAULT '{}', -- Saved filters (region, branch, date range)
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, dashboard_id)
);

CREATE INDEX idx_dashboard_user_prefs_user ON dashboard_user_preferences(user_id);

-- ============================================
-- Dashboard Snapshots (for historical comparison)
-- ============================================
CREATE TABLE IF NOT EXISTS dashboard_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  dashboard_id UUID REFERENCES dashboard_definitions(id) ON DELETE SET NULL,
  snapshot_date TIMESTAMP WITH TIME ZONE NOT NULL,
  metrics JSONB NOT NULL, -- Snapshot of all metrics at this point in time
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_dashboard_snapshots_tenant_date ON dashboard_snapshots(tenant_id, snapshot_date DESC);
CREATE INDEX idx_dashboard_snapshots_dashboard ON dashboard_snapshots(dashboard_id);

-- ============================================
-- Report Definitions
-- ============================================
CREATE TABLE IF NOT EXISTS report_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  description TEXT,
  report_type VARCHAR(100) NOT NULL, -- camera_health, recording_status, storage, incidents, etc.
  category VARCHAR(100), -- operational, compliance, security, executive
  query_config JSONB NOT NULL DEFAULT '{}', -- Data source and query configuration
  output_format VARCHAR(50)[] DEFAULT ARRAY['pdf', 'xlsx', 'csv'],
  requires_approval BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, slug)
);

CREATE INDEX idx_report_definitions_tenant ON report_definitions(tenant_id);
CREATE INDEX idx_report_definitions_type ON report_definitions(report_type);
CREATE INDEX idx_report_definitions_category ON report_definitions(category);

-- ============================================
-- Report Filters
-- ============================================
CREATE TABLE IF NOT EXISTS report_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_definition_id UUID NOT NULL REFERENCES report_definitions(id) ON DELETE CASCADE,
  filter_name VARCHAR(100) NOT NULL,
  filter_type VARCHAR(50) NOT NULL, -- date_range, branch, region, camera, status, severity
  is_required BOOLEAN DEFAULT false,
  default_value JSONB,
  options JSONB, -- Available options for select filters
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_report_filters_definition ON report_filters(report_definition_id);

-- ============================================
-- Report Schedules
-- ============================================
CREATE TABLE IF NOT EXISTS report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  report_definition_id UUID NOT NULL REFERENCES report_definitions(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  frequency VARCHAR(50) NOT NULL, -- daily, weekly, monthly, quarterly, annual, custom
  cron_expression VARCHAR(100), -- For custom schedules
  filters JSONB DEFAULT '{}', -- Applied filters for this schedule
  output_format VARCHAR(50) NOT NULL,
  delivery_method VARCHAR(50)[] DEFAULT ARRAY['email', 'in_app'],
  recipients JSONB NOT NULL, -- Array of user IDs or email addresses
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_report_schedules_tenant ON report_schedules(tenant_id);
CREATE INDEX idx_report_schedules_next_run ON report_schedules(next_run_at) WHERE is_active = true;

-- ============================================
-- Report Runs (Execution History)
-- ============================================
CREATE TABLE IF NOT EXISTS report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  report_definition_id UUID NOT NULL REFERENCES report_definitions(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES report_schedules(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
  filters_applied JSONB DEFAULT '{}',
  output_format VARCHAR(50) NOT NULL,
  row_count INT,
  file_size BIGINT, -- bytes
  file_path TEXT,
  error_message TEXT,
  execution_time_ms INT,
  requested_by UUID REFERENCES users(id),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_report_runs_tenant ON report_runs(tenant_id);
CREATE INDEX idx_report_runs_definition ON report_runs(report_definition_id);
CREATE INDEX idx_report_runs_status ON report_runs(status);
CREATE INDEX idx_report_runs_created ON report_runs(created_at DESC);

-- ============================================
-- Report Exports (Download/Share Tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS report_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  report_run_id UUID NOT NULL REFERENCES report_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  purpose TEXT,
  approval_required BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  recipient TEXT, -- External recipient if shared
  watermark_id VARCHAR(100),
  download_count INT DEFAULT 0,
  last_downloaded_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  revoked BOOLEAN DEFAULT false,
  revoked_at TIMESTAMP WITH TIME ZONE,
  revoked_by UUID REFERENCES users(id),
  device_info JSONB, -- User agent, IP address
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_report_exports_tenant ON report_exports(tenant_id);
CREATE INDEX idx_report_exports_run ON report_exports(report_run_id);
CREATE INDEX idx_report_exports_user ON report_exports(user_id);
CREATE INDEX idx_report_exports_created ON report_exports(created_at DESC);

-- ============================================
-- Camera Health Daily Summary
-- ============================================
CREATE TABLE IF NOT EXISTS camera_health_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  branch_node_id UUID NOT NULL REFERENCES organization_nodes(id),
  summary_date DATE NOT NULL,
  online_minutes INT NOT NULL DEFAULT 0,
  offline_minutes INT NOT NULL DEFAULT 0,
  degraded_minutes INT NOT NULL DEFAULT 0,
  maintenance_minutes INT NOT NULL DEFAULT 0,
  availability_percentage DECIMAL(5,2),
  avg_frame_rate DECIMAL(6,2),
  avg_bitrate BIGINT,
  avg_network_latency_ms INT,
  quality_issues_count INT DEFAULT 0,
  tamper_events_count INT DEFAULT 0,
  health_status VARCHAR(50), -- healthy, warning, critical
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(camera_id, summary_date)
);

CREATE INDEX idx_camera_health_daily_tenant_date ON camera_health_daily(tenant_id, summary_date DESC);
CREATE INDEX idx_camera_health_daily_camera ON camera_health_daily(camera_id, summary_date DESC);
CREATE INDEX idx_camera_health_daily_branch ON camera_health_daily(branch_node_id, summary_date DESC);

-- ============================================
-- Recording Status Daily Summary
-- ============================================
CREATE TABLE IF NOT EXISTS recording_status_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  branch_node_id UUID NOT NULL REFERENCES organization_nodes(id),
  summary_date DATE NOT NULL,
  expected_recording_minutes INT NOT NULL,
  available_recording_minutes INT NOT NULL,
  gap_count INT DEFAULT 0,
  total_gap_minutes INT DEFAULT 0,
  largest_gap_minutes INT DEFAULT 0,
  availability_percentage DECIMAL(5,2),
  integrity_verified BOOLEAN DEFAULT false,
  verification_status VARCHAR(50), -- pass, pass_with_observation, fail
  retention_compliant BOOLEAN DEFAULT true,
  legal_hold_active BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(camera_id, summary_date)
);

CREATE INDEX idx_recording_daily_tenant_date ON recording_status_daily(tenant_id, summary_date DESC);
CREATE INDEX idx_recording_daily_camera ON recording_status_daily(camera_id, summary_date DESC);
CREATE INDEX idx_recording_daily_branch ON recording_status_daily(branch_node_id, summary_date DESC);

-- ============================================
-- Recording Gap Summary (for detailed gap tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS recording_gap_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  gap_start TIMESTAMP WITH TIME ZONE NOT NULL,
  gap_end TIMESTAMP WITH TIME ZONE NOT NULL,
  gap_duration_minutes INT NOT NULL,
  gap_reason VARCHAR(255), -- camera_offline, storage_full, network_failure, etc.
  incident_created UUID REFERENCES incidents(id),
  work_order_created UUID,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recording_gaps_tenant ON recording_gap_summary(tenant_id);
CREATE INDEX idx_recording_gaps_camera ON recording_gap_summary(camera_id, gap_start DESC);
CREATE INDEX idx_recording_gaps_date ON recording_gap_summary(gap_start DESC);

-- ============================================
-- Storage Capacity Snapshots
-- ============================================
CREATE TABLE IF NOT EXISTS storage_capacity_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  storage_node_id UUID NOT NULL,
  branch_node_id UUID REFERENCES organization_nodes(id),
  snapshot_time TIMESTAMP WITH TIME ZONE NOT NULL,
  total_capacity_bytes BIGINT NOT NULL,
  used_capacity_bytes BIGINT NOT NULL,
  available_capacity_bytes BIGINT NOT NULL,
  utilization_percentage DECIMAL(5,2),
  daily_growth_bytes BIGINT,
  forecast_full_days INT,
  raid_status VARCHAR(50),
  disk_health_status VARCHAR(50),
  replication_status VARCHAR(50),
  backup_status VARCHAR(50),
  alert_threshold_exceeded BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_storage_snapshots_tenant_time ON storage_capacity_snapshots(tenant_id, snapshot_time DESC);
CREATE INDEX idx_storage_snapshots_node ON storage_capacity_snapshots(storage_node_id, snapshot_time DESC);
CREATE INDEX idx_storage_snapshots_branch ON storage_capacity_snapshots(branch_node_id, snapshot_time DESC);

-- ============================================
-- Storage Forecasts
-- ============================================
CREATE TABLE IF NOT EXISTS storage_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  storage_node_id UUID NOT NULL,
  forecast_date DATE NOT NULL,
  predicted_utilization_percentage DECIMAL(5,2),
  predicted_exhaustion_date DATE,
  confidence_level DECIMAL(4,2), -- 0.0 to 1.0
  model_used VARCHAR(100), -- linear, exponential, ml_based
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(storage_node_id, forecast_date)
);

CREATE INDEX idx_storage_forecasts_node ON storage_forecasts(storage_node_id, forecast_date DESC);

-- ============================================
-- Incident Metrics Daily
-- ============================================
CREATE TABLE IF NOT EXISTS incident_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_node_id UUID REFERENCES organization_nodes(id),
  summary_date DATE NOT NULL,
  total_incidents INT DEFAULT 0,
  critical_incidents INT DEFAULT 0,
  high_incidents INT DEFAULT 0,
  medium_incidents INT DEFAULT 0,
  low_incidents INT DEFAULT 0,
  open_incidents INT DEFAULT 0,
  closed_incidents INT DEFAULT 0,
  avg_response_time_minutes INT,
  avg_investigation_time_minutes INT,
  police_notifications INT DEFAULT 0,
  estimated_financial_loss DECIMAL(15,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, branch_node_id, summary_date)
);

CREATE INDEX idx_incident_metrics_tenant_date ON incident_metrics_daily(tenant_id, summary_date DESC);
CREATE INDEX idx_incident_metrics_branch ON incident_metrics_daily(branch_node_id, summary_date DESC);

-- ============================================
-- Alert Metrics Daily
-- ============================================
CREATE TABLE IF NOT EXISTS alert_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_node_id UUID REFERENCES organization_nodes(id),
  summary_date DATE NOT NULL,
  total_alerts INT DEFAULT 0,
  critical_alerts INT DEFAULT 0,
  high_alerts INT DEFAULT 0,
  medium_alerts INT DEFAULT 0,
  low_alerts INT DEFAULT 0,
  acknowledged_count INT DEFAULT 0,
  escalated_count INT DEFAULT 0,
  false_alarm_count INT DEFAULT 0,
  converted_to_incident_count INT DEFAULT 0,
  avg_acknowledgment_time_minutes INT,
  avg_resolution_time_minutes INT,
  sla_breaches INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, branch_node_id, summary_date)
);

CREATE INDEX idx_alert_metrics_tenant_date ON alert_metrics_daily(tenant_id, summary_date DESC);
CREATE INDEX idx_alert_metrics_branch ON alert_metrics_daily(branch_node_id, summary_date DESC);

-- ============================================
-- Maintenance Metrics Daily
-- ============================================
CREATE TABLE IF NOT EXISTS maintenance_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_node_id UUID REFERENCES organization_nodes(id),
  summary_date DATE NOT NULL,
  total_work_orders INT DEFAULT 0,
  open_work_orders INT DEFAULT 0,
  completed_work_orders INT DEFAULT 0,
  overdue_work_orders INT DEFAULT 0,
  preventive_maintenance INT DEFAULT 0,
  corrective_maintenance INT DEFAULT 0,
  avg_resolution_time_hours INT,
  total_downtime_minutes INT DEFAULT 0,
  sla_compliant_count INT DEFAULT 0,
  sla_breach_count INT DEFAULT 0,
  total_cost DECIMAL(15,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, branch_node_id, summary_date)
);

CREATE INDEX idx_maintenance_metrics_tenant_date ON maintenance_metrics_daily(tenant_id, summary_date DESC);
CREATE INDEX idx_maintenance_metrics_branch ON maintenance_metrics_daily(branch_node_id, summary_date DESC);

-- ============================================
-- Downtime Events
-- ============================================
CREATE TABLE IF NOT EXISTS downtime_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_id UUID, -- Camera, storage node, or other asset
  asset_type VARCHAR(50) NOT NULL, -- camera, recording, storage, network, power, integration
  branch_node_id UUID REFERENCES organization_nodes(id),
  downtime_start TIMESTAMP WITH TIME ZONE NOT NULL,
  downtime_end TIMESTAMP WITH TIME ZONE,
  duration_minutes INT,
  planned BOOLEAN DEFAULT false,
  root_cause TEXT,
  impact_description TEXT,
  cameras_affected INT,
  incident_id UUID REFERENCES incidents(id),
  work_order_id UUID,
  sla_breached BOOLEAN DEFAULT false,
  corrective_action TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_downtime_events_tenant ON downtime_events(tenant_id);
CREATE INDEX idx_downtime_events_asset ON downtime_events(asset_id, downtime_start DESC);
CREATE INDEX idx_downtime_events_branch ON downtime_events(branch_node_id, downtime_start DESC);
CREATE INDEX idx_downtime_events_start ON downtime_events(downtime_start DESC);

-- ============================================
-- Downtime Metrics Daily
-- ============================================
CREATE TABLE IF NOT EXISTS downtime_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_node_id UUID REFERENCES organization_nodes(id),
  asset_type VARCHAR(50) NOT NULL,
  summary_date DATE NOT NULL,
  total_downtime_minutes INT DEFAULT 0,
  planned_downtime_minutes INT DEFAULT 0,
  unplanned_downtime_minutes INT DEFAULT 0,
  incident_count INT DEFAULT 0,
  availability_percentage DECIMAL(5,2),
  mtbf_hours DECIMAL(10,2), -- Mean Time Between Failures
  mttr_hours DECIMAL(10,2), -- Mean Time To Repair
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, branch_node_id, asset_type, summary_date)
);

CREATE INDEX idx_downtime_metrics_tenant_date ON downtime_metrics_daily(tenant_id, summary_date DESC);
CREATE INDEX idx_downtime_metrics_branch ON downtime_metrics_daily(branch_node_id, summary_date DESC);

-- ============================================
-- System Health Scores
-- ============================================
CREATE TABLE IF NOT EXISTS system_health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_node_id UUID REFERENCES organization_nodes(id), -- NULL for organization-wide
  score_time TIMESTAMP WITH TIME ZONE NOT NULL,
  overall_score DECIMAL(5,2) NOT NULL,
  camera_availability_score DECIMAL(5,2),
  recording_availability_score DECIMAL(5,2),
  storage_health_score DECIMAL(5,2),
  network_health_score DECIMAL(5,2),
  power_health_score DECIMAL(5,2),
  integration_health_score DECIMAL(5,2),
  maintenance_compliance_score DECIMAL(5,2),
  security_audit_score DECIMAL(5,2),
  health_status VARCHAR(50), -- healthy, good, warning, critical, severe
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_health_scores_tenant_time ON system_health_scores(tenant_id, score_time DESC);
CREATE INDEX idx_health_scores_branch ON system_health_scores(branch_node_id, score_time DESC);

-- ============================================
-- System Health Components (detailed breakdown)
-- ============================================
CREATE TABLE IF NOT EXISTS system_health_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_score_id UUID NOT NULL REFERENCES system_health_scores(id) ON DELETE CASCADE,
  component_name VARCHAR(100) NOT NULL,
  component_score DECIMAL(5,2) NOT NULL,
  weight_percentage DECIMAL(5,2) NOT NULL,
  weighted_contribution DECIMAL(5,2),
  status VARCHAR(50), -- healthy, warning, critical
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_health_components_score ON system_health_components(health_score_id);

-- ============================================
-- Metric Thresholds (configurable thresholds)
-- ============================================
CREATE TABLE IF NOT EXISTS metric_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metric_name VARCHAR(100) NOT NULL,
  metric_type VARCHAR(50) NOT NULL, -- camera_availability, recording_availability, storage_utilization, etc.
  warning_threshold DECIMAL(10,2),
  critical_threshold DECIMAL(10,2),
  threshold_direction VARCHAR(10) NOT NULL, -- above, below
  unit VARCHAR(50), -- percentage, minutes, bytes, count
  applies_to VARCHAR(50) DEFAULT 'all', -- all, branch, region, camera
  scope_id UUID, -- Branch or region ID if specific
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, metric_name, applies_to, scope_id)
);

CREATE INDEX idx_metric_thresholds_tenant ON metric_thresholds(tenant_id);
CREATE INDEX idx_metric_thresholds_type ON metric_thresholds(metric_type);

-- ============================================
-- Metric Anomalies (detected unusual patterns)
-- ============================================
CREATE TABLE IF NOT EXISTS metric_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  anomaly_type VARCHAR(100) NOT NULL,
  severity VARCHAR(50) NOT NULL, -- info, warning, critical
  metric_name VARCHAR(100) NOT NULL,
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL,
  description TEXT NOT NULL,
  baseline_value DECIMAL(15,2),
  current_value DECIMAL(15,2),
  deviation_percentage DECIMAL(6,2),
  affected_entity_type VARCHAR(50), -- camera, branch, region, system
  affected_entity_id UUID,
  investigation_status VARCHAR(50) DEFAULT 'new', -- new, investigating, resolved, false_positive
  investigated_by UUID REFERENCES users(id),
  resolution_notes TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_anomalies_tenant_detected ON metric_anomalies(tenant_id, detected_at DESC);
CREATE INDEX idx_anomalies_status ON metric_anomalies(investigation_status);
CREATE INDEX idx_anomalies_entity ON metric_anomalies(affected_entity_type, affected_entity_id);

-- ============================================
-- Footage Retrieval Log (audit trail for video access)
-- ============================================
CREATE TABLE IF NOT EXISTS footage_retrieval_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  camera_id UUID NOT NULL REFERENCES cameras(id),
  branch_node_id UUID NOT NULL REFERENCES organization_nodes(id),
  action_type VARCHAR(50) NOT NULL, -- search, playback, snapshot, clip, export
  recording_start TIMESTAMP WITH TIME ZONE NOT NULL,
  recording_end TIMESTAMP WITH TIME ZONE NOT NULL,
  purpose TEXT,
  incident_id UUID REFERENCES incidents(id),
  case_reference VARCHAR(255),
  approval_required BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  recipient TEXT, -- External recipient if shared
  watermark_id VARCHAR(100),
  device_info JSONB,
  ip_address INET,
  result VARCHAR(50), -- success, failed, denied
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_footage_log_tenant ON footage_retrieval_log(tenant_id, created_at DESC);
CREATE INDEX idx_footage_log_user ON footage_retrieval_log(user_id, created_at DESC);
CREATE INDEX idx_footage_log_camera ON footage_retrieval_log(camera_id, created_at DESC);
CREATE INDEX idx_footage_log_incident ON footage_retrieval_log(incident_id);
