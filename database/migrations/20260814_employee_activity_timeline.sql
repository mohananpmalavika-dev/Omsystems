-- Employee activity timeline query support.
-- The canonical transaction stream (audit_events) is already append-only and
-- hash chained by migration 030. These indexes make per-employee, time-bounded
-- timeline reads efficient without duplicating transaction evidence.

CREATE INDEX IF NOT EXISTS idx_audit_events_actor_time
  ON audit_events (tenant_id, actor_user_id, occurred_at DESC)
  WHERE actor_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_sessions_user_logout
  ON user_activity_sessions (tenant_id, user_id, logout_time DESC)
  WHERE logout_time IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_page_visits_user_end
  ON user_page_visits (tenant_id, user_id, visit_end_time DESC)
  WHERE visit_end_time IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_control_room_user_end
  ON control_room_monitoring_activity (tenant_id, user_id, monitoring_end_time DESC)
  WHERE monitoring_end_time IS NOT NULL;

COMMENT ON INDEX idx_audit_events_actor_time IS
  'Supports employee transaction timeline reads over the immutable audit chain';
