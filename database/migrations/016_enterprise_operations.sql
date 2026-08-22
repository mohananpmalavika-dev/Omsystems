-- Enterprise Operations Features Migration
-- On-call Escalation, Duty Roster, Workload Balancing, SLA Tracking

-- ============================================================================
-- Escalation Policies
-- ============================================================================

CREATE TABLE IF NOT EXISTS escalation_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  severity text NOT NULL, -- P1, P2, P3, P4
  levels jsonb NOT NULL, -- Array of escalation levels
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, severity, name)
);

CREATE INDEX escalation_policies_tenant_severity_idx ON escalation_policies(tenant_id, severity) WHERE enabled = true;

-- ============================================================================
-- Escalation States
-- ============================================================================

CREATE TYPE escalation_status AS ENUM ('active', 'acknowledged', 'resolved', 'expired');

CREATE TABLE IF NOT EXISTS escalation_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  policy_id uuid NOT NULL REFERENCES escalation_policies(id),
  current_level integer NOT NULL DEFAULT 1,
  status escalation_status NOT NULL DEFAULT 'active',
  assigned_to uuid REFERENCES users(id),
  acknowledged_by uuid REFERENCES users(id),
  acknowledged_at timestamptz,
  escalation_history jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX escalation_states_alert_idx ON escalation_states(alert_id);
CREATE INDEX escalation_states_status_idx ON escalation_states(status) WHERE status = 'active';
CREATE INDEX escalation_states_tenant_idx ON escalation_states(tenant_id);

-- ============================================================================
-- Escalation Notifications
-- ============================================================================

CREATE TABLE IF NOT EXISTS escalation_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escalation_id uuid NOT NULL REFERENCES escalation_states(id),
  user_id uuid NOT NULL REFERENCES users(id),
  level integer NOT NULL,
  alert_id uuid NOT NULL,
  acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX escalation_notifications_user_idx ON escalation_notifications(user_id) WHERE acknowledged = false;

-- ============================================================================
-- Duty Rosters
-- ============================================================================

CREATE TYPE roster_type AS ENUM ('rotating', 'fixed', 'follow-the-sun');

CREATE TABLE IF NOT EXISTS duty_rosters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  description text,
  type roster_type NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  enabled boolean NOT NULL DEFAULT true,
  members jsonb NOT NULL DEFAULT '[]', -- Array of roster members
  schedule jsonb NOT NULL, -- Schedule pattern
  handoff_notification_minutes integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX duty_rosters_tenant_idx ON duty_rosters(tenant_id) WHERE enabled = true;

-- ============================================================================
-- On-Call Shifts
-- ============================================================================

CREATE TYPE shift_status AS ENUM ('scheduled', 'active', 'completed', 'cancelled');

CREATE TABLE IF NOT EXISTS on_call_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_id uuid NOT NULL REFERENCES duty_rosters(id),
  user_id uuid NOT NULL REFERENCES users(id),
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  status shift_status NOT NULL DEFAULT 'scheduled',
  handed_off_from uuid REFERENCES users(id),
  handed_off_to uuid REFERENCES users(id),
  handoff_notes text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX on_call_shifts_roster_time_idx ON on_call_shifts(roster_id, start_time, end_time);
CREATE INDEX on_call_shifts_user_time_idx ON on_call_shifts(user_id, start_time) WHERE status IN ('scheduled', 'active');
CREATE INDEX on_call_shifts_active_idx ON on_call_shifts(status, start_time, end_time) WHERE status = 'active';

-- ============================================================================
-- Shift Handoffs
-- ============================================================================

CREATE TYPE handoff_status AS ENUM ('pending', 'acknowledged', 'completed');

CREATE TABLE IF NOT EXISTS shift_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES on_call_shifts(id),
  from_user_id uuid NOT NULL REFERENCES users(id),
  to_user_id uuid NOT NULL REFERENCES users(id),
  handoff_time timestamptz NOT NULL,
  status handoff_status NOT NULL DEFAULT 'pending',
  notes text,
  open_incidents integer NOT NULL DEFAULT 0,
  pending_tasks integer NOT NULL DEFAULT 0,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX shift_handoffs_to_user_idx ON shift_handoffs(to_user_id) WHERE status = 'pending';

-- ============================================================================
-- SLA Policies
-- ============================================================================

CREATE TABLE IF NOT EXISTS sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  severity text NOT NULL, -- P1, P2, P3, P4
  acknowledgment_minutes integer NOT NULL,
  resolution_hours integer NOT NULL,
  business_hours_only boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, severity, name)
);

CREATE INDEX sla_policies_tenant_severity_idx ON sla_policies(tenant_id, severity) WHERE enabled = true;

-- ============================================================================
-- SLA Tracking
-- ============================================================================

CREATE TYPE sla_status AS ENUM ('within_sla', 'at_risk', 'breached');

CREATE TABLE IF NOT EXISTS sla_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL UNIQUE,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  policy_id uuid NOT NULL REFERENCES sla_policies(id),
  acknowledgment_sla_at timestamptz NOT NULL,
  resolution_sla_at timestamptz NOT NULL,
  acknowledgment_status sla_status NOT NULL DEFAULT 'within_sla',
  resolution_status sla_status NOT NULL DEFAULT 'within_sla',
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  acknowledgment_breach_minutes integer,
  resolution_breach_hours integer,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX sla_tracking_tenant_idx ON sla_tracking(tenant_id);
CREATE INDEX sla_tracking_breach_idx ON sla_tracking(tenant_id, acknowledgment_status, resolution_status);

-- ============================================================================
-- Maintenance Windows
-- ============================================================================

CREATE TABLE IF NOT EXISTS maintenance_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  description text,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  suppress_alerts boolean NOT NULL DEFAULT true,
  suppress_notifications boolean NOT NULL DEFAULT true,
  affected_resources jsonb, -- Array of camera/branch IDs
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time)
);

CREATE INDEX maintenance_windows_time_idx ON maintenance_windows(tenant_id, start_time, end_time);

-- ============================================================================
-- Operator Workload Tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS operator_workload (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  date date NOT NULL,
  active_alerts integer NOT NULL DEFAULT 0,
  acknowledged_alerts integer NOT NULL DEFAULT 0,
  resolved_alerts integer NOT NULL DEFAULT 0,
  avg_response_time_minutes numeric,
  avg_resolution_time_hours numeric,
  workload_score integer NOT NULL DEFAULT 0, -- 0-100
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, user_id, date)
);

CREATE INDEX operator_workload_tenant_date_idx ON operator_workload(tenant_id, date DESC);
CREATE INDEX operator_workload_user_idx ON operator_workload(user_id, date DESC);
