-- Video Analytics & AI control-plane schema. Inference runs independently;
-- this schema owns configuration, normalized events, alerts, and audit history.

CREATE TABLE analytics_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  version text NOT NULL,
  provider text NOT NULL DEFAULT 'custom',
  detection_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  deployment_target text NOT NULL DEFAULT 'edge'
    CHECK (deployment_target IN ('edge', 'central', 'hybrid')),
  enabled boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, name, version)
);

CREATE TABLE analytics_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  name text NOT NULL,
  shape text NOT NULL CHECK (shape IN ('polygon', 'line')),
  points jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(points) = 'array')
);

CREATE INDEX analytics_zones_camera_idx ON analytics_zones (camera_id);

CREATE TABLE analytics_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  zone_id uuid REFERENCES analytics_zones(id) ON DELETE SET NULL,
  model_id uuid REFERENCES analytics_models(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 160),
  detection_type text NOT NULL CHECK (detection_type IN (
    'motion', 'person', 'vehicle', 'object', 'line-crossing', 'intrusion',
    'loitering', 'crowd-density', 'camera-tampering', 'video-loss', 'fire-smoke'
  )),
  enabled boolean NOT NULL DEFAULT true,
  schedule jsonb,
  object_classes jsonb NOT NULL DEFAULT '[]'::jsonb,
  min_confidence numeric(5,4) NOT NULL DEFAULT 0.65
    CHECK (min_confidence BETWEEN 0 AND 1),
  min_duration_seconds numeric(10,3) NOT NULL DEFAULT 0
    CHECK (min_duration_seconds BETWEEN 0 AND 86400),
  direction text NOT NULL DEFAULT 'any'
    CHECK (direction IN ('any', 'a-to-b', 'b-to-a', 'enter', 'exit')),
  severity text NOT NULL DEFAULT 'P3'
    CHECK (severity IN ('P1', 'P2', 'P3', 'P4', 'P5')),
  cooldown_seconds integer NOT NULL DEFAULT 60
    CHECK (cooldown_seconds BETWEEN 0 AND 86400),
  recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  escalate_after_seconds integer CHECK (escalate_after_seconds BETWEEN 30 AND 86400),
  recording_policy text NOT NULL DEFAULT 'event-recording'
    CHECK (recording_policy IN ('none', 'event-recording', 'protect-window')),
  pre_roll_seconds integer NOT NULL DEFAULT 30 CHECK (pre_roll_seconds BETWEEN 0 AND 120),
  post_roll_seconds integer NOT NULL DEFAULT 120 CHECK (post_roll_seconds BETWEEN 30 AND 600),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX analytics_rules_camera_type_idx
  ON analytics_rules (camera_id, detection_type)
  WHERE enabled AND archived_at IS NULL;
CREATE UNIQUE INDEX analytics_rules_camera_name_uidx
  ON analytics_rules (camera_id, name) WHERE archived_at IS NULL;

CREATE TABLE analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  source_event_id text NOT NULL,
  primary_rule_id uuid REFERENCES analytics_rules(id) ON DELETE SET NULL,
  detection_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  ended_at timestamptz,
  confidence numeric(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  duration_seconds numeric(10,3) NOT NULL DEFAULT 0,
  model_version text NOT NULL,
  snapshot_reference text,
  clip_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK (status IN ('accepted', 'suppressed', 'unmatched')),
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_event_id),
  CHECK (ended_at IS NULL OR ended_at >= occurred_at)
);

CREATE INDEX analytics_events_camera_time_idx
  ON analytics_events (camera_id, occurred_at DESC);

CREATE TABLE detected_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES analytics_events(id) ON DELETE CASCADE,
  label text NOT NULL,
  confidence numeric(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  track_id text,
  bounding_box jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX detected_objects_event_idx ON detected_objects (event_id);

CREATE TABLE object_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  external_track_id text NOT NULL,
  object_class text NOT NULL,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  path jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (camera_id, external_track_id)
);

CREATE TABLE analytics_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES analytics_rules(id) ON DELETE RESTRICT,
  event_id uuid NOT NULL REFERENCES analytics_events(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text,
  severity text NOT NULL CHECK (severity IN ('P1', 'P2', 'P3', 'P4', 'P5')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN (
    'new', 'acknowledged', 'investigating', 'escalated', 'resolved',
    'false_alarm', 'suppressed'
  )),
  confidence numeric(5,4) NOT NULL,
  object_classes jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_version text NOT NULL,
  snapshot_reference text,
  clip_reference text,
  first_detected_at timestamptz NOT NULL,
  last_detected_at timestamptz NOT NULL,
  occurrence_count integer NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  incident_id uuid REFERENCES live_incidents(id) ON DELETE SET NULL,
  acknowledged_by uuid REFERENCES users(id),
  acknowledged_at timestamptz,
  false_alarm_reason text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX analytics_alerts_tenant_status_idx
  ON analytics_alerts (tenant_id, status, last_detected_at DESC);
CREATE INDEX analytics_alerts_camera_rule_idx
  ON analytics_alerts (camera_id, rule_id, last_detected_at DESC);

CREATE TABLE analytics_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  alert_id uuid NOT NULL REFERENCES analytics_alerts(id) ON DELETE CASCADE,
  recipient text NOT NULL,
  channel text NOT NULL DEFAULT 'configured',
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX analytics_notifications_queue_idx
  ON analytics_notifications (status, created_at) WHERE status IN ('queued', 'failed');

CREATE TABLE analytics_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  alert_id uuid NOT NULL REFERENCES analytics_alerts(id) ON DELETE CASCADE,
  escalated_by uuid REFERENCES users(id),
  recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  escalated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE analytics_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  alert_id uuid NOT NULL REFERENCES analytics_alerts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  notes text,
  acknowledged_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE analytics_footfall_metrics (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  bucket_at timestamptz NOT NULL,
  entries integer NOT NULL DEFAULT 0,
  exits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (camera_id, bucket_at)
);

CREATE TABLE analytics_dwell_metrics (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  zone_id uuid REFERENCES analytics_zones(id) ON DELETE CASCADE,
  bucket_at timestamptz NOT NULL,
  average_seconds numeric(12,3) NOT NULL DEFAULT 0,
  maximum_seconds numeric(12,3) NOT NULL DEFAULT 0,
  sample_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (camera_id, zone_id, bucket_at)
);

CREATE TABLE analytics_queue_metrics (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  zone_id uuid REFERENCES analytics_zones(id) ON DELETE CASCADE,
  bucket_at timestamptz NOT NULL,
  average_count numeric(12,3) NOT NULL DEFAULT 0,
  maximum_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (camera_id, zone_id, bucket_at)
);

CREATE TABLE analytics_heatmap_metrics (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  bucket_at timestamptz NOT NULL,
  grid_width integer NOT NULL CHECK (grid_width > 0),
  grid_height integer NOT NULL CHECK (grid_height > 0),
  values jsonb NOT NULL,
  PRIMARY KEY (camera_id, bucket_at)
);

INSERT INTO role_permissions (role, action, resource_type, can_grant, description)
VALUES
  ('super_admin', 'analytics:view', NULL, true, 'View video analytics'),
  ('super_admin', 'analytics:configure', NULL, true, 'Configure analytics rules'),
  ('super_admin', 'alerts:acknowledge', NULL, true, 'Acknowledge analytics alerts'),
  ('super_admin', 'alerts:escalate', NULL, true, 'Escalate analytics alerts'),
  ('super_admin', 'analytics:export', NULL, true, 'Export analytics data'),
  ('company_admin', 'analytics:view', 'company', true, 'View video analytics'),
  ('company_admin', 'analytics:configure', 'company', true, 'Configure analytics rules'),
  ('company_admin', 'alerts:acknowledge', 'company', true, 'Acknowledge analytics alerts'),
  ('company_admin', 'alerts:escalate', 'company', true, 'Escalate analytics alerts'),
  ('company_admin', 'analytics:export', 'company', true, 'Export analytics data'),
  ('hq_admin', 'analytics:view', 'headquarters', true, 'View video analytics'),
  ('hq_admin', 'analytics:configure', 'headquarters', true, 'Configure analytics rules'),
  ('hq_admin', 'alerts:acknowledge', 'headquarters', true, 'Acknowledge analytics alerts'),
  ('hq_admin', 'alerts:escalate', 'headquarters', true, 'Escalate analytics alerts'),
  ('hq_admin', 'analytics:export', 'headquarters', true, 'Export analytics data'),
  ('zone_manager', 'analytics:view', 'zone', false, 'View video analytics'),
  ('zone_manager', 'analytics:configure', 'zone', false, 'Configure analytics rules'),
  ('zone_manager', 'alerts:acknowledge', 'zone', false, 'Acknowledge analytics alerts'),
  ('zone_manager', 'alerts:escalate', 'zone', false, 'Escalate analytics alerts'),
  ('zone_manager', 'analytics:export', 'zone', false, 'Export analytics data'),
  ('region_manager', 'analytics:view', 'region', false, 'View video analytics'),
  ('region_manager', 'analytics:configure', 'region', false, 'Configure analytics rules'),
  ('region_manager', 'alerts:acknowledge', 'region', false, 'Acknowledge analytics alerts'),
  ('region_manager', 'alerts:escalate', 'region', false, 'Escalate analytics alerts'),
  ('region_manager', 'analytics:export', 'region', false, 'Export analytics data'),
  ('area_manager', 'analytics:view', 'area', false, 'View video analytics'),
  ('area_manager', 'alerts:acknowledge', 'area', false, 'Acknowledge analytics alerts'),
  ('area_manager', 'analytics:export', 'area', false, 'Export analytics data'),
  ('branch_manager', 'analytics:view', 'branch', false, 'View video analytics'),
  ('branch_manager', 'analytics:configure', 'branch', false, 'Configure analytics rules'),
  ('branch_manager', 'alerts:acknowledge', 'branch', false, 'Acknowledge analytics alerts'),
  ('branch_manager', 'alerts:escalate', 'branch', false, 'Escalate analytics alerts'),
  ('branch_manager', 'analytics:export', 'branch', false, 'Export analytics data'),
  ('operator', 'analytics:view', 'branch', false, 'View video analytics'),
  ('operator', 'alerts:acknowledge', 'branch', false, 'Acknowledge analytics alerts'),
  ('viewer', 'analytics:view', NULL, false, 'View video analytics'),
  ('security_officer', 'analytics:view', 'branch', false, 'View video analytics'),
  ('security_officer', 'alerts:acknowledge', 'branch', false, 'Acknowledge analytics alerts'),
  ('security_officer', 'alerts:escalate', 'branch', false, 'Escalate analytics alerts'),
  ('security_officer', 'analytics:export', 'branch', false, 'Export analytics data'),
  ('auditor', 'analytics:view', NULL, false, 'View video analytics'),
  ('auditor', 'analytics:export', NULL, false, 'Export analytics data')
ON CONFLICT (role, action, resource_type) DO NOTHING;

-- Rebuild role-derived grants so existing employees receive the new actions.
UPDATE users SET role=role WHERE role IS NOT NULL;

COMMENT ON TABLE analytics_rules IS
  'Per-camera Phase 1 analytics policy; inference execution remains outside the control plane';
COMMENT ON TABLE analytics_events IS
  'Normalized, idempotent detections submitted by analytics engines';
COMMENT ON TABLE analytics_alerts IS
  'Deduplicated operator alerts with acknowledgement, escalation, and incident linkage';
