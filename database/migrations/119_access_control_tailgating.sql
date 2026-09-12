-- ============================================================================
-- Migration 119: Access Control Tailgating Detection Hardening (analytics.tailgating)
--
-- Authoritative schema for sequence correlation between electronic badge swipes
-- and overhead/interior camera person counts in secure airlock doors / mantraps.
-- ============================================================================

-- 1. Create airlock portals table (mantraps / interlocking door vestibules)
CREATE TABLE IF NOT EXISTS airlock_portals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  branch_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  camera_id uuid REFERENCES cameras(id) ON DELETE SET NULL,
  outer_door_id text NOT NULL,
  inner_door_id text NOT NULL,
  chamber_zone jsonb NOT NULL DEFAULT '[]'::jsonb,
  max_allowed_occupancy integer NOT NULL DEFAULT 1 CHECK (max_allowed_occupancy >= 1),
  correlation_window_seconds integer NOT NULL DEFAULT 10 CHECK (correlation_window_seconds >= 2),
  interlock_mode text NOT NULL DEFAULT 'strict_interlock' CHECK (interlock_mode IN ('strict_interlock', 'manual_release', 'warning_only')),
  auto_lock_inner_door boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_airlock_portals_tenant
  ON airlock_portals (tenant_id);

CREATE INDEX IF NOT EXISTS idx_airlock_portals_doors
  ON airlock_portals (tenant_id, outer_door_id, inner_door_id);

-- 2. Create access control badge events table
CREATE TABLE IF NOT EXISTS access_control_badge_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  portal_id uuid REFERENCES airlock_portals(id) ON DELETE SET NULL,
  door_id text NOT NULL,
  badge_id text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  person_name text,
  event_type text NOT NULL CHECK (event_type IN ('granted', 'denied', 'forced', 'held_open', 'tailgating')),
  authorized_count integer NOT NULL DEFAULT 1 CHECK (authorized_count >= 0),
  direction text NOT NULL DEFAULT 'entry' CHECK (direction IN ('entry', 'exit')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  timestamp timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_badge_events_tenant_time
  ON access_control_badge_events (tenant_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_badge_events_portal_time
  ON access_control_badge_events (portal_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_badge_events_door_time
  ON access_control_badge_events (door_id, timestamp DESC);

-- 3. Create authoritative tailgating detection incidents table
CREATE TABLE IF NOT EXISTS tailgating_detection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  portal_id uuid REFERENCES airlock_portals(id) ON DELETE SET NULL,
  camera_id uuid REFERENCES cameras(id) ON DELETE SET NULL,
  door_id text NOT NULL,
  badge_id text,
  badge_holder_name text,
  detected_person_count integer NOT NULL CHECK (detected_person_count >= 0),
  authorized_count integer NOT NULL CHECK (authorized_count >= 0),
  tailgater_count integer NOT NULL CHECK (tailgater_count >= 1),
  violation_type text NOT NULL CHECK (violation_type IN (
    'piggyback_tailgating',
    'unbadged_entry',
    'denied_entry_breach',
    'multi_occupancy_violation',
    'door_held_breach'
  )),
  severity text NOT NULL CHECK (severity IN ('P1', 'P2', 'P3')),
  confidence numeric(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  time_gap_ms integer NOT NULL DEFAULT 0,
  participant_track_ids text[] NOT NULL DEFAULT '{}',
  bounding_boxes jsonb NOT NULL DEFAULT '[]'::jsonb,
  sequence_timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  interlock_lockdown_engaged boolean NOT NULL DEFAULT true,
  snapshot_reference text,
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'confirmed', 'false_positive', 'escalated')),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tailgating_events_tenant_time
  ON tailgating_detection_events (tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_tailgating_events_portal_time
  ON tailgating_detection_events (portal_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_tailgating_events_review
  ON tailgating_detection_events (tenant_id, review_status, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_tailgating_events_severity
  ON tailgating_detection_events (tenant_id, severity, occurred_at DESC);

-- 4. Create per-portal configuration overrides for tailgating detection
CREATE TABLE IF NOT EXISTS tailgating_detection_configs (
  portal_id uuid PRIMARY KEY REFERENCES airlock_portals(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  sensitivity numeric(3,2) NOT NULL DEFAULT 0.80 CHECK (sensitivity BETWEEN 0.1 AND 1.0),
  min_confidence numeric(3,2) NOT NULL DEFAULT 0.75 CHECK (min_confidence BETWEEN 0.1 AND 1.0),
  max_time_gap_ms integer NOT NULL DEFAULT 3000 CHECK (max_time_gap_ms >= 500),
  correlation_window_seconds integer NOT NULL DEFAULT 10 CHECK (correlation_window_seconds >= 2),
  max_allowed_occupancy integer NOT NULL DEFAULT 1 CHECK (max_allowed_occupancy >= 1),
  auto_lock_inner_door boolean NOT NULL DEFAULT true,
  alert_severity text NOT NULL DEFAULT 'P1' CHECK (alert_severity IN ('P1', 'P2', 'P3')),
  cooldown_seconds integer NOT NULL DEFAULT 15 CHECK (cooldown_seconds >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tailgating_configs_tenant
  ON tailgating_detection_configs (tenant_id);

-- 5. Audit comments
COMMENT ON TABLE airlock_portals IS
  'Secure mantrap portals and airlock vestibules configured with interlocking doors and chamber surveillance.';
COMMENT ON TABLE access_control_badge_events IS
  'Authoritative physical access control system (PACS) badge swipes and credential authentication records.';
COMMENT ON TABLE tailgating_detection_events IS
  'Authoritative incident ledger for access control tailgating, piggybacking, and airlock occupancy breaches.';
COMMENT ON TABLE tailgating_detection_configs IS
  'Per-portal threshold configs and automated interlocking safety response rules.';
