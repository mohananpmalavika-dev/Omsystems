-- Employee Activity Tracking System
-- Purpose: Track complete employee journey from login to logout
-- including page visits, time spent, and control room monitoring activities

-- ============================================
-- User Sessions (Extended tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS user_activity_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token_hash VARCHAR(255), -- Link to auth session
  
  -- Session timing
  login_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  logout_time TIMESTAMP WITH TIME ZONE,
  last_activity_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total_duration_seconds INT, -- Calculated on logout
  active_duration_seconds INT DEFAULT 0, -- Time actually interacting (not idle)
  idle_duration_seconds INT DEFAULT 0,
  
  -- Session metadata
  device_info JSONB, -- Browser, OS, device type
  ip_address INET,
  location_info JSONB, -- Geographic location if available
  
  -- Session status
  session_status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, idle, logged_out, expired, terminated
  termination_reason VARCHAR(100), -- user_logout, timeout, forced, system
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_activity_sessions_user ON user_activity_sessions(user_id, login_time DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_sessions_tenant ON user_activity_sessions(tenant_id, login_time DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_sessions_status ON user_activity_sessions(session_status) WHERE session_status = 'active';
CREATE INDEX IF NOT EXISTS idx_user_activity_sessions_logout ON user_activity_sessions(logout_time DESC) WHERE logout_time IS NOT NULL;

-- ============================================
-- Page Visit Tracking
-- ============================================
CREATE TABLE IF NOT EXISTS user_page_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES user_activity_sessions(id) ON DELETE CASCADE,
  
  -- Page information
  page_path VARCHAR(500) NOT NULL, -- /dashboard, /cameras, /control-room, etc.
  page_title VARCHAR(255),
  page_module VARCHAR(100) NOT NULL, -- dashboard, camera_management, control_room, incidents, etc.
  page_category VARCHAR(100), -- operations, monitoring, administration, reports, etc.
  
  -- Timing information
  visit_start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  visit_end_time TIMESTAMP WITH TIME ZONE,
  duration_seconds INT, -- Time spent on this page
  active_time_seconds INT DEFAULT 0, -- Active interaction time
  idle_time_seconds INT DEFAULT 0, -- Idle time on page
  
  -- Interaction metrics
  click_count INT DEFAULT 0,
  scroll_depth_percentage INT DEFAULT 0,
  form_interactions_count INT DEFAULT 0,
  
  -- Navigation context
  referrer_path VARCHAR(500), -- Previous page
  next_page_path VARCHAR(500), -- Next page navigated to
  
  -- Additional context
  query_parameters JSONB, -- URL query params for context
  page_metadata JSONB, -- Any additional page-specific data
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_page_visits_user_session ON user_page_visits(user_id, session_id, visit_start_time DESC);
CREATE INDEX IF NOT EXISTS idx_page_visits_tenant ON user_page_visits(tenant_id, visit_start_time DESC);
CREATE INDEX IF NOT EXISTS idx_page_visits_module ON user_page_visits(page_module, visit_start_time DESC);
CREATE INDEX IF NOT EXISTS idx_page_visits_session ON user_page_visits(session_id, visit_start_time ASC);
CREATE INDEX IF NOT EXISTS idx_page_visits_active ON user_page_visits(visit_end_time) WHERE visit_end_time IS NULL;

-- ============================================
-- Control Room Activity Tracking
-- ============================================
CREATE TABLE IF NOT EXISTS control_room_monitoring_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES user_activity_sessions(id) ON DELETE CASCADE,
  page_visit_id UUID REFERENCES user_page_visits(id) ON DELETE CASCADE,
  
  -- Monitoring target
  monitoring_type VARCHAR(50) NOT NULL, -- single_branch, branch_group, multi_branch, camera, camera_group
  branch_node_id UUID REFERENCES resource_nodes(id) ON DELETE SET NULL, -- Primary branch being monitored
  branch_group_id UUID, -- If monitoring a group
  branch_group_name VARCHAR(255),
  
  -- Monitoring details
  camera_ids UUID[], -- Specific cameras being monitored
  camera_count INT DEFAULT 0,
  branch_ids UUID[], -- All branches in view
  branch_names TEXT[], -- Branch names for reporting
  
  -- Timing
  monitoring_start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  monitoring_end_time TIMESTAMP WITH TIME ZONE,
  duration_seconds INT,
  
  -- Activity metrics
  alert_count INT DEFAULT 0, -- Alerts viewed during this monitoring session
  incident_count INT DEFAULT 0, -- Incidents created/handled
  camera_switch_count INT DEFAULT 0, -- Number of times camera view changed
  playback_count INT DEFAULT 0, -- Number of playback sessions initiated
  snapshot_count INT DEFAULT 0, -- Snapshots taken
  export_count INT DEFAULT 0, -- Video exports initiated
  
  -- Context
  monitoring_mode VARCHAR(50), -- live, review, investigation, alert_response
  metadata JSONB, -- Additional monitoring context
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_control_room_activity_user ON control_room_monitoring_activity(user_id, monitoring_start_time DESC);
CREATE INDEX IF NOT EXISTS idx_control_room_activity_session ON control_room_monitoring_activity(session_id, monitoring_start_time ASC);
CREATE INDEX IF NOT EXISTS idx_control_room_activity_branch ON control_room_monitoring_activity(branch_node_id, monitoring_start_time DESC);
CREATE INDEX IF NOT EXISTS idx_control_room_activity_tenant ON control_room_monitoring_activity(tenant_id, monitoring_start_time DESC);
CREATE INDEX IF NOT EXISTS idx_control_room_activity_active ON control_room_monitoring_activity(monitoring_end_time) WHERE monitoring_end_time IS NULL;

-- ============================================
-- User Action Log (Detailed activity tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS user_action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES user_activity_sessions(id) ON DELETE CASCADE,
  page_visit_id UUID REFERENCES user_page_visits(id) ON DELETE SET NULL,
  
  -- Action details
  action_type VARCHAR(100) NOT NULL, -- button_click, form_submit, search, filter, export, etc.
  action_category VARCHAR(50) NOT NULL, -- navigation, data_entry, data_view, export, configuration, etc.
  action_target VARCHAR(255), -- What was acted upon (camera_id, incident_id, etc.)
  action_description TEXT,
  
  -- Context
  module_name VARCHAR(100) NOT NULL,
  feature_name VARCHAR(100),
  
  -- Metadata
  action_metadata JSONB, -- Detailed action context
  
  -- Timing
  action_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_action_log_user ON user_action_log(user_id, action_time DESC);
CREATE INDEX IF NOT EXISTS idx_user_action_log_session ON user_action_log(session_id, action_time ASC);
CREATE INDEX IF NOT EXISTS idx_user_action_log_tenant_time ON user_action_log(tenant_id, action_time DESC);
CREATE INDEX IF NOT EXISTS idx_user_action_log_type ON user_action_log(action_type, action_time DESC);
CREATE INDEX IF NOT EXISTS idx_user_action_log_module ON user_action_log(module_name, action_time DESC);

-- ============================================
-- Daily Activity Summary (Aggregated metrics)
-- ============================================
CREATE TABLE IF NOT EXISTS user_activity_daily_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  summary_date DATE NOT NULL,
  
  -- Session metrics
  total_sessions INT DEFAULT 0,
  total_login_duration_seconds INT DEFAULT 0,
  total_active_duration_seconds INT DEFAULT 0,
  total_idle_duration_seconds INT DEFAULT 0,
  avg_session_duration_seconds INT DEFAULT 0,
  
  -- Page visit metrics
  total_page_visits INT DEFAULT 0,
  unique_pages_visited INT DEFAULT 0,
  most_visited_page VARCHAR(500),
  most_visited_module VARCHAR(100),
  total_page_time_seconds INT DEFAULT 0,
  
  -- Module usage
  module_usage_breakdown JSONB, -- { "dashboard": 300, "control_room": 1800, ... }
  
  -- Control room metrics
  control_room_sessions INT DEFAULT 0,
  control_room_duration_seconds INT DEFAULT 0,
  unique_branches_monitored INT DEFAULT 0,
  total_alerts_handled INT DEFAULT 0,
  total_incidents_created INT DEFAULT 0,
  
  -- Action metrics
  total_actions INT DEFAULT 0,
  action_type_breakdown JSONB, -- Count by action type
  
  -- Productivity metrics
  peak_activity_hour INT, -- Hour of day with most activity (0-23)
  activity_score DECIMAL(5,2), -- Calculated productivity score (0-100)
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(user_id, summary_date)
);

CREATE INDEX IF NOT EXISTS idx_user_daily_summary_user_date ON user_activity_daily_summary(user_id, summary_date DESC);
CREATE INDEX IF NOT EXISTS idx_user_daily_summary_tenant_date ON user_activity_daily_summary(tenant_id, summary_date DESC);
CREATE INDEX IF NOT EXISTS idx_user_daily_summary_date ON user_activity_daily_summary(summary_date DESC);

-- ============================================
-- Weekly Activity Summary
-- ============================================
CREATE TABLE IF NOT EXISTS user_activity_weekly_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL, -- Monday of the week
  week_end_date DATE NOT NULL, -- Sunday of the week
  year INT NOT NULL,
  week_number INT NOT NULL, -- ISO week number
  
  -- Session metrics
  total_sessions INT DEFAULT 0,
  total_working_days INT DEFAULT 0, -- Days with at least one session
  total_login_duration_seconds INT DEFAULT 0,
  total_active_duration_seconds INT DEFAULT 0,
  avg_daily_duration_seconds INT DEFAULT 0,
  
  -- Module usage
  module_usage_breakdown JSONB,
  top_3_modules JSONB, -- [{module, duration, percentage}, ...]
  
  -- Control room metrics
  control_room_duration_seconds INT DEFAULT 0,
  unique_branches_monitored INT DEFAULT 0,
  total_alerts_handled INT DEFAULT 0,
  
  -- Activity patterns
  most_active_day DATE,
  least_active_day DATE,
  activity_consistency_score DECIMAL(5,2), -- How consistent daily activity is
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(user_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_user_weekly_summary_user ON user_activity_weekly_summary(user_id, week_start_date DESC);
CREATE INDEX IF NOT EXISTS idx_user_weekly_summary_tenant ON user_activity_weekly_summary(tenant_id, week_start_date DESC);

-- ============================================
-- Monthly Activity Summary
-- ============================================
CREATE TABLE IF NOT EXISTS user_activity_monthly_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year INT NOT NULL,
  month INT NOT NULL, -- 1-12
  
  -- Session metrics
  total_sessions INT DEFAULT 0,
  total_working_days INT DEFAULT 0,
  total_login_duration_seconds INT DEFAULT 0,
  total_active_duration_seconds INT DEFAULT 0,
  avg_daily_duration_seconds INT DEFAULT 0,
  
  -- Module usage
  module_usage_breakdown JSONB,
  top_5_modules JSONB,
  module_diversity_score DECIMAL(5,2), -- How varied module usage is
  
  -- Control room metrics
  control_room_duration_seconds INT DEFAULT 0,
  control_room_percentage DECIMAL(5,2), -- % of time in control room
  unique_branches_monitored INT DEFAULT 0,
  branch_monitoring_breakdown JSONB, -- Time per branch
  total_alerts_handled INT DEFAULT 0,
  total_incidents_created INT DEFAULT 0,
  
  -- Productivity metrics
  total_actions INT DEFAULT 0,
  avg_actions_per_day DECIMAL(10,2),
  activity_trend VARCHAR(20), -- increasing, stable, decreasing
  month_over_month_change_percentage DECIMAL(6,2),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(user_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_user_monthly_summary_user ON user_activity_monthly_summary(user_id, year DESC, month DESC);
CREATE INDEX IF NOT EXISTS idx_user_monthly_summary_tenant ON user_activity_monthly_summary(tenant_id, year DESC, month DESC);

-- ============================================
-- Real-time Activity Status (Current activity)
-- ============================================
CREATE TABLE IF NOT EXISTS user_current_activity (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id UUID REFERENCES user_activity_sessions(id) ON DELETE SET NULL,
  
  -- Current status
  is_online BOOLEAN DEFAULT false,
  current_page_path VARCHAR(500),
  current_module VARCHAR(100),
  current_activity VARCHAR(255), -- "Monitoring Branch: Downtown", "Viewing Incident #123", etc.
  
  -- Control room specific
  is_in_control_room BOOLEAN DEFAULT false,
  current_branch_id UUID REFERENCES resource_nodes(id) ON DELETE SET NULL,
  current_branch_name VARCHAR(255),
  current_branch_group VARCHAR(255),
  monitoring_camera_count INT DEFAULT 0,
  
  -- Timing
  last_activity_time TIMESTAMP WITH TIME ZONE,
  page_entered_time TIMESTAMP WITH TIME ZONE,
  
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_current_activity_tenant ON user_current_activity(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_current_activity_online ON user_current_activity(is_online) WHERE is_online = true;
CREATE INDEX IF NOT EXISTS idx_user_current_activity_control_room ON user_current_activity(is_in_control_room, current_branch_id) WHERE is_in_control_room = true;

-- ============================================
-- Activity Report Definitions (Configurable reports)
-- ============================================
CREATE TABLE IF NOT EXISTS activity_report_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  report_type VARCHAR(100) NOT NULL, -- user_session_detail, module_usage, control_room_activity, productivity, comparison
  
  -- Report configuration
  metrics_included TEXT[], -- Array of metric names to include
  grouping_level VARCHAR(50), -- user, department, role, branch
  time_granularity VARCHAR(50), -- hourly, daily, weekly, monthly
  
  -- Filters
  default_filters JSONB,
  
  -- Access control
  allowed_roles TEXT[],
  is_system_report BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_report_defs_tenant ON activity_report_definitions(tenant_id);

-- ============================================
-- Functions for automatic summary generation
-- ============================================

-- Function to update daily summary
CREATE OR REPLACE FUNCTION update_user_daily_activity_summary(
  p_user_id UUID,
  p_date DATE
) RETURNS void AS $$
DECLARE
  v_tenant_id UUID;
  v_module_usage JSONB;
  v_action_breakdown JSONB;
BEGIN
  -- Get tenant_id
  SELECT tenant_id INTO v_tenant_id FROM users WHERE id = p_user_id;
  
  -- Calculate module usage
  SELECT jsonb_object_agg(page_module, total_seconds)
  INTO v_module_usage
  FROM (
    SELECT 
      page_module,
      SUM(COALESCE(duration_seconds, 0)) as total_seconds
    FROM user_page_visits
    WHERE user_id = p_user_id
      AND DATE(visit_start_time) = p_date
    GROUP BY page_module
  ) module_data;
  
  -- Calculate action breakdown
  SELECT jsonb_object_agg(action_type, action_count)
  INTO v_action_breakdown
  FROM (
    SELECT 
      action_type,
      COUNT(*) as action_count
    FROM user_action_log
    WHERE user_id = p_user_id
      AND DATE(action_time) = p_date
    GROUP BY action_type
  ) action_data;
  
  -- Insert or update summary
  INSERT INTO user_activity_daily_summary (
    tenant_id,
    user_id,
    summary_date,
    total_sessions,
    total_login_duration_seconds,
    total_active_duration_seconds,
    total_idle_duration_seconds,
    avg_session_duration_seconds,
    total_page_visits,
    unique_pages_visited,
    most_visited_page,
    most_visited_module,
    total_page_time_seconds,
    module_usage_breakdown,
    control_room_sessions,
    control_room_duration_seconds,
    unique_branches_monitored,
    total_alerts_handled,
    total_incidents_created,
    total_actions,
    action_type_breakdown
  )
  SELECT
    v_tenant_id,
    p_user_id,
    p_date,
    COUNT(DISTINCT s.id),
    SUM(COALESCE(s.total_duration_seconds, 0)),
    SUM(COALESCE(s.active_duration_seconds, 0)),
    SUM(COALESCE(s.idle_duration_seconds, 0)),
    AVG(COALESCE(s.total_duration_seconds, 0))::INT,
    COUNT(DISTINCT pv.id),
    COUNT(DISTINCT pv.page_path),
    (SELECT page_path FROM user_page_visits 
     WHERE user_id = p_user_id AND DATE(visit_start_time) = p_date
     GROUP BY page_path ORDER BY COUNT(*) DESC LIMIT 1),
    (SELECT page_module FROM user_page_visits 
     WHERE user_id = p_user_id AND DATE(visit_start_time) = p_date
     GROUP BY page_module ORDER BY SUM(COALESCE(duration_seconds, 0)) DESC LIMIT 1),
    SUM(COALESCE(pv.duration_seconds, 0)),
    COALESCE(v_module_usage, '{}'::jsonb),
    COUNT(DISTINCT cr.id),
    SUM(COALESCE(cr.duration_seconds, 0)),
    COUNT(DISTINCT cr.branch_node_id),
    SUM(COALESCE(cr.alert_count, 0)),
    SUM(COALESCE(cr.incident_count, 0)),
    (SELECT COUNT(*) FROM user_action_log WHERE user_id = p_user_id AND DATE(action_time) = p_date),
    COALESCE(v_action_breakdown, '{}'::jsonb)
  FROM user_activity_sessions s
  LEFT JOIN user_page_visits pv ON pv.session_id = s.id
  LEFT JOIN control_room_monitoring_activity cr ON cr.session_id = s.id
  WHERE s.user_id = p_user_id
    AND DATE(s.login_time) = p_date
  GROUP BY s.user_id
  ON CONFLICT (user_id, summary_date) 
  DO UPDATE SET
    total_sessions = EXCLUDED.total_sessions,
    total_login_duration_seconds = EXCLUDED.total_login_duration_seconds,
    total_active_duration_seconds = EXCLUDED.total_active_duration_seconds,
    total_idle_duration_seconds = EXCLUDED.total_idle_duration_seconds,
    avg_session_duration_seconds = EXCLUDED.avg_session_duration_seconds,
    total_page_visits = EXCLUDED.total_page_visits,
    unique_pages_visited = EXCLUDED.unique_pages_visited,
    most_visited_page = EXCLUDED.most_visited_page,
    most_visited_module = EXCLUDED.most_visited_module,
    total_page_time_seconds = EXCLUDED.total_page_time_seconds,
    module_usage_breakdown = EXCLUDED.module_usage_breakdown,
    control_room_sessions = EXCLUDED.control_room_sessions,
    control_room_duration_seconds = EXCLUDED.control_room_duration_seconds,
    unique_branches_monitored = EXCLUDED.unique_branches_monitored,
    total_alerts_handled = EXCLUDED.total_alerts_handled,
    total_incidents_created = EXCLUDED.total_incidents_created,
    total_actions = EXCLUDED.total_actions,
    action_type_breakdown = EXCLUDED.action_type_breakdown,
    updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Trigger to update current activity
-- ============================================
CREATE OR REPLACE FUNCTION update_user_current_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'user_page_visits' THEN
    INSERT INTO user_current_activity (
      user_id,
      tenant_id,
      session_id,
      is_online,
      current_page_path,
      current_module,
      last_activity_time,
      page_entered_time,
      updated_at
    )
    VALUES (
      NEW.user_id,
      NEW.tenant_id,
      NEW.session_id,
      true,
      NEW.page_path,
      NEW.page_module,
      NEW.visit_start_time,
      NEW.visit_start_time,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      session_id = EXCLUDED.session_id,
      is_online = EXCLUDED.is_online,
      current_page_path = EXCLUDED.current_page_path,
      current_module = EXCLUDED.current_module,
      last_activity_time = EXCLUDED.last_activity_time,
      page_entered_time = EXCLUDED.page_entered_time,
      updated_at = EXCLUDED.updated_at;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_current_activity_on_page_visit ON user_page_visits;
CREATE TRIGGER trg_update_current_activity_on_page_visit
  AFTER INSERT ON user_page_visits
  FOR EACH ROW
  EXECUTE FUNCTION update_user_current_activity();

-- ============================================
-- Views for reporting
-- ============================================

-- Active users right now
CREATE OR REPLACE VIEW v_active_users_now AS
SELECT 
  u.id as user_id,
  u.display_name,
  u.identity_subject as username,
  uca.current_module,
  uca.current_activity,
  uca.is_in_control_room,
  uca.current_branch_name,
  uca.last_activity_time,
  EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - uca.last_activity_time)) as idle_seconds,
  uas.login_time,
  EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - uas.login_time)) as session_duration_seconds
FROM user_current_activity uca
JOIN users u ON u.id = uca.user_id
LEFT JOIN user_activity_sessions uas ON uas.id = uca.session_id
WHERE uca.is_online = true
  AND uca.last_activity_time > (CURRENT_TIMESTAMP - INTERVAL '5 minutes');

-- User session detail view
CREATE OR REPLACE VIEW v_user_session_details AS
SELECT 
  uas.id as session_id,
  uas.tenant_id,
  uas.user_id,
  u.display_name,
  u.identity_subject as username,
  uas.login_time,
  uas.logout_time,
  uas.total_duration_seconds,
  uas.active_duration_seconds,
  uas.session_status,
  COUNT(DISTINCT upv.id) as page_visits,
  COUNT(DISTINCT upv.page_module) as unique_modules,
  COUNT(DISTINCT crma.id) as control_room_sessions,
  SUM(COALESCE(crma.duration_seconds, 0)) as control_room_duration_seconds,
  COUNT(DISTINCT crma.branch_node_id) as branches_monitored
FROM user_activity_sessions uas
JOIN users u ON u.id = uas.user_id
LEFT JOIN user_page_visits upv ON upv.session_id = uas.id
LEFT JOIN control_room_monitoring_activity crma ON crma.session_id = uas.id
GROUP BY uas.id, uas.tenant_id, uas.user_id, u.display_name, u.identity_subject,
         uas.login_time, uas.logout_time, uas.total_duration_seconds,
         uas.active_duration_seconds, uas.session_status;

COMMENT ON TABLE user_activity_sessions IS 'Tracks complete user sessions from login to logout';
COMMENT ON TABLE user_page_visits IS 'Records every page visit with timing and interaction metrics';
COMMENT ON TABLE control_room_monitoring_activity IS 'Tracks which branches and cameras are being monitored';
COMMENT ON TABLE user_action_log IS 'Detailed log of all user actions and interactions';
COMMENT ON TABLE user_activity_daily_summary IS 'Daily aggregated metrics per user';
COMMENT ON TABLE user_current_activity IS 'Real-time snapshot of what each user is currently doing';
