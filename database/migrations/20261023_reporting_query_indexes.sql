-- Reporting predicates keep UUID and timestamp columns uncast so these
-- indexes can constrain tenant, subject/branch, and report period together.
-- Apply through the migration runner during an appropriate database window.
CREATE INDEX IF NOT EXISTS activity_sessions_tenant_user_login_report_idx
  ON user_activity_sessions (tenant_id, user_id, login_time DESC);
CREATE INDEX IF NOT EXISTS page_visits_tenant_user_start_report_idx
  ON user_page_visits (tenant_id, user_id, visit_start_time DESC);
CREATE INDEX IF NOT EXISTS control_room_tenant_user_start_report_idx
  ON control_room_monitoring_activity (tenant_id, user_id, monitoring_start_time DESC);
CREATE INDEX IF NOT EXISTS user_actions_tenant_user_time_report_idx
  ON user_action_log (tenant_id, user_id, action_time DESC);
CREATE INDEX IF NOT EXISTS incidents_tenant_branch_occurred_report_idx
  ON incidents (tenant_id, branch_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS incidents_tenant_branch_detected_report_idx
  ON incidents (tenant_id, branch_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS incident_acknowledgement_report_idx
  ON incident_status_history (incident_id, created_at) WHERE status = 'acknowledged';
CREATE INDEX IF NOT EXISTS work_orders_tenant_created_report_idx
  ON work_orders (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS work_orders_tenant_branch_created_report_idx
  ON work_orders (tenant_id, branch_node_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_alerts_tenant_camera_time_report_idx
  ON analytics_alerts (tenant_id, camera_id, last_detected_at DESC, id DESC);
