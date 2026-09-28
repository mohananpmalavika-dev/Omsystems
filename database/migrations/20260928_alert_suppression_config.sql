-- 20260928_alert_suppression_config.sql
-- Alert Suppression Configuration: per-tenant, per-branch, per-camera, and per-detection-type overrides.
-- Enables SOC operators and branch managers to toggle specific alert types on/off
-- at the global, branch, or camera granularity level without modifying AI rules.

CREATE TABLE IF NOT EXISTS alert_suppression_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Scope: if branch_id is NULL, applies to all branches in the tenant (global).
  --        if camera_id is NULL, applies to all cameras in that branch.
  branch_id     TEXT,
  camera_id     TEXT,

  -- detection_type: NULL means ALL detection types at this scope.
  -- Otherwise matches operational_alerts.detection_type.
  detection_type TEXT,

  -- The actual toggle: true = alerts are suppressed (muted), false = alerts fire normally.
  suppressed    BOOLEAN NOT NULL DEFAULT FALSE,

  -- Human-readable label for the UI (e.g. "All alerts", "Intrusion", "Camera Tamper")
  label         TEXT NOT NULL DEFAULT 'All Alerts',

  -- Who last changed this and when
  updated_by    TEXT NOT NULL DEFAULT 'system',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A suppression config is uniquely identified by the (tenant, branch, camera, detection_type) composite.
  -- Null values participate in uniqueness (via COALESCE hack) so we use a unique partial approach.
  CONSTRAINT alert_suppression_scope_unique UNIQUE NULLS NOT DISTINCT (
    tenant_id,
    branch_id,
    camera_id,
    detection_type
  )
);

-- Ensure fast lookups when the ingest path checks suppression on hot path.
CREATE INDEX IF NOT EXISTS idx_alert_suppression_tenant
  ON alert_suppression_config (tenant_id);

CREATE INDEX IF NOT EXISTS idx_alert_suppression_branch
  ON alert_suppression_config (tenant_id, branch_id)
  WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_alert_suppression_camera
  ON alert_suppression_config (tenant_id, branch_id, camera_id)
  WHERE camera_id IS NOT NULL;

-- Audit log for suppression changes
CREATE TABLE IF NOT EXISTS alert_suppression_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suppression_id  UUID NOT NULL REFERENCES alert_suppression_config(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL,
  branch_id       TEXT,
  camera_id       TEXT,
  detection_type  TEXT,
  suppressed      BOOLEAN NOT NULL,
  changed_by      TEXT NOT NULL,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason          TEXT
);

CREATE INDEX IF NOT EXISTS idx_alert_suppression_audit_suppression
  ON alert_suppression_audit (suppression_id, changed_at DESC);
