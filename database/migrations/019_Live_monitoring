-- =====================================================
-- Migration 019: Live Monitoring Enhancements
-- Description: PTZ control, video walls, camera sequences,
--              shift management, and alert workflow
-- =====================================================

-- =====================================================
-- PTZ (Pan-Tilt-Zoom) Control System
-- =====================================================

-- PTZ Locks: Prevent simultaneous camera control
CREATE TABLE IF NOT EXISTS ptz_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  operator_id uuid NOT NULL REFERENCES users(id),
  operator_name text NOT NULL,
  session_id text NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > locked_at)
);

CREATE INDEX IF NOT EXISTS ptz_locks_camera_idx ON ptz_locks(camera_id);
CREATE INDEX IF NOT EXISTS ptz_locks_expires_idx ON ptz_locks(expires_at);
CREATE INDEX IF NOT EXISTS ptz_locks_operator_idx ON ptz_locks(operator_id);

-- PTZ Presets: Named camera positions
CREATE TABLE IF NOT EXISTS ptz_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  preset_number integer NOT NULL CHECK (preset_number BETWEEN 1 AND 256),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  description text CHECK (description IS NULL OR length(description) <= 500),
  position jsonb, -- {pan: number, tilt: number, zoom: number}
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(camera_id, preset_number)
);

CREATE INDEX IF NOT EXISTS ptz_presets_camera_idx ON ptz_presets(camera_id);
CREATE INDEX IF NOT EXISTS ptz_presets_tenant_idx ON ptz_presets(tenant_id);

-- PTZ Patrols: Automated camera tours
CREATE TABLE IF NOT EXISTS ptz_patrols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  patrol_number integer NOT NULL CHECK (patrol_number BETWEEN 1 AND 32),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  presets jsonb NOT NULL, -- [{presetNumber: number, dwellSeconds: number, speed: number}]
  repeat boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(camera_id, patrol_number)
);

CREATE INDEX IF NOT EXISTS ptz_patrols_camera_idx ON ptz_patrols(camera_id);
CREATE INDEX IF NOT EXISTS ptz_patrols_tenant_enabled_idx ON ptz_patrols(tenant_id, enabled);

-- =====================================================
-- Video Wall and Grid Layouts
-- =====================================================

-- Video Wall Layouts: Multi-camera grid configurations
CREATE TABLE IF NOT EXISTS video_wall_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  description text CHECK (description IS NULL OR length(description) <= 500),
  grid_size text NOT NULL CHECK (grid_size IN ('1x1', '2x2', '3x3', '4x4', '5x5', '6x6')),
  camera_positions jsonb NOT NULL, -- [{position: number, cameraId: string, stream: 'main'|'sub'}]
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS video_wall_layouts_tenant_idx ON video_wall_layouts(tenant_id);
CREATE INDEX IF NOT EXISTS video_wall_layouts_default_idx ON video_wall_layouts(tenant_id, is_default) WHERE is_default = true;

-- =====================================================
-- Camera Sequencing
-- =====================================================

-- Camera Sequences: Auto-rotation configurations
CREATE TABLE IF NOT EXISTS camera_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  description text CHECK (description IS NULL OR length(description) <= 500),
  cameras jsonb NOT NULL, -- [{cameraId: string, displaySeconds: number}]
  repeat boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  schedule jsonb, -- {days: number[], start: string, end: string}
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS camera_sequences_tenant_idx ON camera_sequences(tenant_id);
CREATE INDEX IF NOT EXISTS camera_sequences_enabled_idx ON camera_sequences(tenant_id, enabled) WHERE enabled = true;

-- =====================================================
-- Shift Management System
-- =====================================================

-- Monitoring Shifts: Shift schedule definitions
CREATE TABLE IF NOT EXISTS monitoring_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shift_name text NOT NULL CHECK (length(shift_name) BETWEEN 1 AND 100),
  start_time time NOT NULL,
  end_time time NOT NULL,
  days_of_week integer[] NOT NULL CHECK (array_length(days_of_week, 1) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, shift_name)
);

CREATE INDEX IF NOT EXISTS monitoring_shifts_tenant_idx ON monitoring_shifts(tenant_id);

-- Shift Assignments: Operator shift assignments
CREATE TABLE IF NOT EXISTS shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES monitoring_shifts(id) ON DELETE CASCADE,
  operator_id uuid NOT NULL REFERENCES users(id),
  operator_name text NOT NULL,
  assigned_date date NOT NULL,
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'completed', 'no_show', 'cancelled')),
  notes text CHECK (notes IS NULL OR length(notes) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(shift_id, operator_id, assigned_date),
  CHECK (clock_out_at IS NULL OR clock_in_at IS NULL OR clock_out_at > clock_in_at)
);

CREATE INDEX IF NOT EXISTS shift_assignments_operator_idx ON shift_assignments(operator_id);
CREATE INDEX IF NOT EXISTS shift_assignments_date_idx ON shift_assignments(assigned_date);
CREATE INDEX IF NOT EXISTS shift_assignments_status_idx ON shift_assignments(status);
CREATE INDEX IF NOT EXISTS shift_assignments_shift_date_idx ON shift_assignments(shift_id, assigned_date);

-- Shift Handover Logs: Shift transition tracking
CREATE TABLE IF NOT EXISTS shift_handover_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  outgoing_operator_id uuid NOT NULL REFERENCES users(id),
  outgoing_operator_name text NOT NULL,
  incoming_operator_id uuid NOT NULL REFERENCES users(id),
  incoming_operator_name text NOT NULL,
  shift_start timestamptz NOT NULL,
  shift_end timestamptz NOT NULL,
  handover_notes text CHECK (handover_notes IS NULL OR length(handover_notes) <= 5000),
  acknowledged_by uuid REFERENCES users(id),
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (shift_end > shift_start),
  CHECK (outgoing_operator_id != incoming_operator_id)
);

CREATE INDEX IF NOT EXISTS shift_handover_logs_incoming_idx ON shift_handover_logs(incoming_operator_id);
CREATE INDEX IF NOT EXISTS shift_handover_logs_outgoing_idx ON shift_handover_logs(outgoing_operator_id);
CREATE INDEX IF NOT EXISTS shift_handover_logs_date_idx ON shift_handover_logs(shift_start);
CREATE INDEX IF NOT EXISTS shift_handover_logs_unack_idx ON shift_handover_logs(acknowledged_at) WHERE acknowledged_at IS NULL;

-- Shift Handover Items: Individual handover checklist items
CREATE TABLE IF NOT EXISTS shift_handover_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handover_id uuid NOT NULL REFERENCES shift_handover_logs(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN (
    'open_incident', 'alert', 'offline_camera', 'storage_warning',
    'maintenance', 'bookmark', 'escalation', 'system_issue', 'other'
  )),
  item_id uuid, -- Reference to related entity (incident, alert, etc.)
  priority text CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'resolved', 'transferred')),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shift_handover_items_handover_idx ON shift_handover_items(handover_id);
CREATE INDEX IF NOT EXISTS shift_handover_items_status_idx ON shift_handover_items(status);
CREATE INDEX IF NOT EXISTS shift_handover_items_priority_idx ON shift_handover_items(priority);

-- =====================================================
-- Operator Session Tracking
-- =====================================================

-- Operator Sessions: Activity and performance tracking
CREATE TABLE IF NOT EXISTS operator_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  operator_id uuid NOT NULL REFERENCES users(id),
  operator_name text NOT NULL,
  workstation_id text CHECK (length(workstation_id) <= 100),
  session_start timestamptz NOT NULL DEFAULT now(),
  session_end timestamptz,
  activity_summary jsonb, -- {cameras_viewed: number, ptz_commands: number, bookmarks: number, incidents: number}
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (session_end IS NULL OR session_end > session_start)
);

CREATE INDEX IF NOT EXISTS operator_sessions_operator_idx ON operator_sessions(operator_id);
CREATE INDEX IF NOT EXISTS operator_sessions_start_idx ON operator_sessions(session_start DESC);
CREATE INDEX IF NOT EXISTS operator_sessions_active_idx ON operator_sessions(tenant_id, operator_id) WHERE session_end IS NULL;

-- =====================================================
-- Enhanced Alert System
-- =====================================================

-- Alert Escalations: Alert escalation workflow
CREATE TABLE IF NOT EXISTS alert_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  alert_id uuid NOT NULL, -- Can reference analytics_alerts or system alerts
  escalated_by uuid NOT NULL REFERENCES users(id),
  escalated_to uuid NOT NULL REFERENCES users(id),
  escalation_level integer NOT NULL DEFAULT 1 CHECK (escalation_level BETWEEN 1 AND 5),
  reason text CHECK (reason IS NULL OR length(reason) <= 1000),
  notes text CHECK (notes IS NULL OR length(notes) <= 2000),
  escalated_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users(id),
  CHECK (acknowledged_at IS NULL OR acknowledged_at >= escalated_at),
  CHECK (resolved_at IS NULL OR acknowledged_at IS NULL OR resolved_at >= acknowledged_at)
);

CREATE INDEX IF NOT EXISTS alert_escalations_alert_idx ON alert_escalations(alert_id);
CREATE INDEX IF NOT EXISTS alert_escalations_to_idx ON alert_escalations(escalated_to);
CREATE INDEX IF NOT EXISTS alert_escalations_unack_idx ON alert_escalations(tenant_id) WHERE acknowledged_at IS NULL;
CREATE INDEX IF NOT EXISTS alert_escalations_unresolved_idx ON alert_escalations(tenant_id) WHERE resolved_at IS NULL;

-- =====================================================
-- Audio Monitoring Control
-- =====================================================

-- Audio Sessions: Track audio monitoring sessions
CREATE TABLE IF NOT EXISTS audio_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  operator_id uuid NOT NULL REFERENCES users(id),
  session_type text NOT NULL CHECK (session_type IN ('listen', 'speak', 'two_way')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer,
  legal_justification text CHECK (length(legal_justification) <= 1000),
  approval_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at > started_at)
);

CREATE INDEX IF NOT EXISTS audio_sessions_camera_idx ON audio_sessions(camera_id);
CREATE INDEX IF NOT EXISTS audio_sessions_operator_idx ON audio_sessions(operator_id);
CREATE INDEX IF NOT EXISTS audio_sessions_started_idx ON audio_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS audio_sessions_active_idx ON audio_sessions(camera_id) WHERE ended_at IS NULL;

-- =====================================================
-- System Health and Status
-- =====================================================

-- Control Room Workstations: Workstation registration
CREATE TABLE IF NOT EXISTS control_room_workstations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workstation_id text NOT NULL CHECK (length(workstation_id) BETWEEN 1 AND 100),
  workstation_name text NOT NULL CHECK (length(workstation_name) BETWEEN 1 AND 200),
  location text,
  capabilities jsonb, -- {monitors: number, video_wall: boolean, max_streams: number}
  status text NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'maintenance')),
  last_seen_at timestamptz,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, workstation_id)
);

CREATE INDEX IF NOT EXISTS control_room_workstations_tenant_idx ON control_room_workstations(tenant_id);
CREATE INDEX IF NOT EXISTS control_room_workstations_status_idx ON control_room_workstations(tenant_id, status);

-- =====================================================
-- Bookmarking Enhancements
-- =====================================================

-- Extend existing live_bookmarks with additional fields
ALTER TABLE live_bookmarks
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS review_status text CHECK (review_status IS NULL OR review_status IN ('pending', 'reviewed', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS export_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_accessed_at timestamptz;

CREATE INDEX IF NOT EXISTS live_bookmarks_tags_idx ON live_bookmarks USING gin(tags) WHERE tags IS NOT NULL AND array_length(tags, 1) > 0;
CREATE INDEX IF NOT EXISTS live_bookmarks_review_status_idx ON live_bookmarks(review_status) WHERE review_status IS NOT NULL;

-- =====================================================
-- Mobile Device Management
-- =====================================================

-- Mobile Devices: Registered mobile devices
CREATE TABLE IF NOT EXISTS mobile_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  device_id text NOT NULL CHECK (length(device_id) BETWEEN 1 AND 200),
  device_name text NOT NULL CHECK (length(device_name) BETWEEN 1 AND 200),
  device_type text NOT NULL CHECK (device_type IN ('ios', 'android')),
  os_version text,
  app_version text,
  push_token text,
  biometric_enabled boolean NOT NULL DEFAULT false,
  last_active_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
  registered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id, device_id)
);

CREATE INDEX IF NOT EXISTS mobile_devices_user_idx ON mobile_devices(user_id);
CREATE INDEX IF NOT EXISTS mobile_devices_status_idx ON mobile_devices(tenant_id, status);
CREATE INDEX IF NOT EXISTS mobile_devices_push_token_idx ON mobile_devices(push_token) WHERE push_token IS NOT NULL;

-- =====================================================
-- Notification Queue
-- =====================================================

-- Push Notifications: Notification delivery tracking
CREATE TABLE IF NOT EXISTS push_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  device_id uuid REFERENCES mobile_devices(id) ON DELETE CASCADE,
  notification_type text NOT NULL CHECK (notification_type IN ('alert', 'incident', 'shift', 'system', 'custom')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  data jsonb, -- Additional payload data
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'cancelled')),
  sent_at timestamptz,
  delivered_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_notifications_user_idx ON push_notifications(user_id);
CREATE INDEX IF NOT EXISTS push_notifications_status_idx ON push_notifications(status, created_at);
CREATE INDEX IF NOT EXISTS push_notifications_pending_idx ON push_notifications(created_at) WHERE status = 'pending';

-- =====================================================
-- Performance and Cleanup
-- =====================================================

-- Function to cleanup expired PTZ locks
CREATE OR REPLACE FUNCTION cleanup_expired_ptz_locks()
RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM ptz_locks WHERE expires_at <= now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to end abandoned operator sessions
CREATE OR REPLACE FUNCTION cleanup_abandoned_operator_sessions(timeout_hours integer DEFAULT 24)
RETURNS integer AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE operator_sessions
  SET session_end = now(),
      activity_summary = COALESCE(activity_summary, '{}'::jsonb) || jsonb_build_object('abandoned', true)
  WHERE session_end IS NULL
    AND session_start < now() - (timeout_hours || ' hours')::interval;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Function to end abandoned audio sessions
CREATE OR REPLACE FUNCTION cleanup_abandoned_audio_sessions(timeout_minutes integer DEFAULT 60)
RETURNS integer AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE audio_sessions
  SET ended_at = now(),
      duration_seconds = EXTRACT(EPOCH FROM (now() - started_at))::integer
  WHERE ended_at IS NULL
    AND started_at < now() - (timeout_minutes || ' minutes')::interval;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Comments and Documentation
-- =====================================================

COMMENT ON TABLE ptz_locks IS 'PTZ camera control locks to prevent simultaneous operator control';
COMMENT ON TABLE ptz_presets IS 'Named PTZ camera positions for quick recall';
COMMENT ON TABLE ptz_patrols IS 'Automated PTZ camera tours through multiple presets';
COMMENT ON TABLE video_wall_layouts IS 'Multi-camera grid layout configurations for control rooms';
COMMENT ON TABLE camera_sequences IS 'Auto-rotation camera sequences for monitoring';
COMMENT ON TABLE monitoring_shifts IS 'Shift schedule definitions for 24/7 operations';
COMMENT ON TABLE shift_assignments IS 'Operator assignments to specific shifts';
COMMENT ON TABLE shift_handover_logs IS 'Shift transition tracking with handover notes';
COMMENT ON TABLE shift_handover_items IS 'Individual checklist items for shift handovers';
COMMENT ON TABLE operator_sessions IS 'Operator activity and performance tracking';
COMMENT ON TABLE alert_escalations IS 'Alert escalation workflow and tracking';
COMMENT ON TABLE audio_sessions IS 'Audio monitoring session tracking for compliance';
COMMENT ON TABLE control_room_workstations IS 'Control room workstation registration and status';
COMMENT ON TABLE mobile_devices IS 'Registered mobile devices for remote monitoring';
COMMENT ON TABLE push_notifications IS 'Push notification delivery tracking';
