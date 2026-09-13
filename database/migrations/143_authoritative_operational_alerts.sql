-- Authoritative Operational Alerts & Comments Persistence
-- Supports PostgresOperationalAlertRepository with zero in-memory authority.

CREATE TABLE IF NOT EXISTS operational_alerts (
  id VARCHAR(128) PRIMARY KEY,
  tenant_id UUID NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  branch_id VARCHAR(128) NOT NULL,
  branch_name VARCHAR(255) NOT NULL,
  branch_code VARCHAR(64),
  branch_zone VARCHAR(64),
  camera_id VARCHAR(128),
  camera_name VARCHAR(255),
  camera_channel INTEGER,
  camera_criticality VARCHAR(32),
  detection_type VARCHAR(64) NOT NULL,
  detection_category VARCHAR(32) NOT NULL,
  detection_title VARCHAR(255) NOT NULL,
  detection_description TEXT,
  confidence NUMERIC(5,4),
  bounding_boxes JSONB NOT NULL DEFAULT '[]'::jsonb,
  severity VARCHAR(16) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'NEW',
  occurred_at TIMESTAMPTZ NOT NULL,
  response_deadline TIMESTAMPTZ NOT NULL,
  resolution_deadline TIMESTAMPTZ NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  assignment JSONB,
  acknowledgement JSONB,
  resolution JSONB,
  escalation_level INTEGER NOT NULL DEFAULT 1,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  dedup_key TEXT NOT NULL,
  correlated_incident_id VARCHAR(128),
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operational_alerts_tenant_status 
  ON operational_alerts (tenant_id, status, severity, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_operational_alerts_branch 
  ON operational_alerts (branch_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_operational_alerts_camera 
  ON operational_alerts (camera_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_operational_alerts_dedup 
  ON operational_alerts (dedup_key);

CREATE TABLE IF NOT EXISTS operational_alert_comments (
  id VARCHAR(128) PRIMARY KEY,
  alert_id VARCHAR(128) NOT NULL REFERENCES operational_alerts(id) ON DELETE CASCADE,
  author_id VARCHAR(128) NOT NULL,
  author_name VARCHAR(255) NOT NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operational_alert_comments_alert 
  ON operational_alert_comments (alert_id, created_at ASC);
