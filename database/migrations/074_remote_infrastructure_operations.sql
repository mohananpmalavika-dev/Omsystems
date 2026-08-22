-- Migration 074: Remote CCTV Infrastructure Operations & Technician Dispatch Minimization
-- Tables for Remote Triage Incidents, Remediation Actions, Surgical Work Orders, and ROI Metrics

CREATE TABLE IF NOT EXISTS remote_ops_incidents (
  incident_id VARCHAR(128) PRIMARY KEY,
  branch_id VARCHAR(128) NOT NULL,
  component_id VARCHAR(128) NOT NULL,
  component_type VARCHAR(64) NOT NULL,
  signal_type VARCHAR(64) NOT NULL,
  root_cause_category VARCHAR(64) NOT NULL,
  confidence_score NUMERIC(5, 4) NOT NULL DEFAULT 0.95,
  narrative TEXT NOT NULL,
  resolved_remotely BOOLEAN NOT NULL DEFAULT FALSE,
  mttr_seconds INT NOT NULL DEFAULT 0,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_remote_ops_branch ON remote_ops_incidents(branch_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_remote_ops_resolved ON remote_ops_incidents(resolved_remotely, detected_at DESC);

CREATE TABLE IF NOT EXISTS remote_remediation_actions (
  action_id VARCHAR(128) PRIMARY KEY,
  incident_id VARCHAR(128) REFERENCES remote_ops_incidents(incident_id) ON DELETE CASCADE,
  branch_id VARCHAR(128) NOT NULL,
  component_id VARCHAR(128) NOT NULL,
  action_type VARCHAR(64) NOT NULL,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  duration_ms INT NOT NULL DEFAULT 0,
  resolution_summary TEXT NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_remediation_actions_branch ON remote_remediation_actions(branch_id, executed_at DESC);

CREATE TABLE IF NOT EXISTS surgical_work_orders (
  work_order_id VARCHAR(128) PRIMARY KEY,
  branch_id VARCHAR(128) NOT NULL,
  branch_name VARCHAR(128) NOT NULL,
  physical_location VARCHAR(255) NOT NULL,
  faulty_component_id VARCHAR(128) NOT NULL,
  model_number VARCHAR(128) NOT NULL,
  required_spare_parts JSONB NOT NULL DEFAULT '[]',
  diagnostic_checklist JSONB NOT NULL DEFAULT '[]',
  priority VARCHAR(32) NOT NULL DEFAULT 'NORMAL',
  status VARCHAR(32) NOT NULL DEFAULT 'DISPATCHED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_surgical_orders_branch ON surgical_work_orders(branch_id, status);

CREATE TABLE IF NOT EXISTS fleet_roi_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_branches INT NOT NULL DEFAULT 500,
  incidents_detected INT NOT NULL DEFAULT 0,
  resolved_remotely INT NOT NULL DEFAULT 0,
  truck_rolls_avoided INT NOT NULL DEFAULT 0,
  total_cost_saved_dollars NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
  average_mttr_seconds INT NOT NULL DEFAULT 45,
  uptime_sla_pct NUMERIC(5, 2) NOT NULL DEFAULT 99.95,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fleet_roi_snapshot ON fleet_roi_snapshots(snapshot_at DESC);
