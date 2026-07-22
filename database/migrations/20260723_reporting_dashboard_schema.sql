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
