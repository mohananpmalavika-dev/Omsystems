-- Migration 149: Authoritative Alerts Compatibility Table
-- Supports DurableAlertRepository, banking analytics, and alert queries with full relational schema.

CREATE TABLE IF NOT EXISTS alerts (
  id VARCHAR(128) PRIMARY KEY,
  event_id VARCHAR(128),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id VARCHAR(128),
  camera_id VARCHAR(128),
  recorder_id VARCHAR(128),
  alert_type VARCHAR(64) NOT NULL,
  severity VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  title VARCHAR(255) NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_operator_id VARCHAR(128),
  escalation_level INTEGER NOT NULL DEFAULT 1,
  sla_due_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  zone_type VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_tenant_status ON alerts(tenant_id, status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_branch ON alerts(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_camera ON alerts(camera_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(alert_type);
