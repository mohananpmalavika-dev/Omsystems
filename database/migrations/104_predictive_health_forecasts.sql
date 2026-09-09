-- Durable, tenant-scoped branch forecasts for the predictive-health worker.
CREATE TABLE IF NOT EXISTS branch_health_prediction_snapshots (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  branch_id text NOT NULL,
  captured_at timestamptz NOT NULL,
  snapshot_data jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS branch_health_prediction_snapshots_lookup_idx
  ON branch_health_prediction_snapshots (tenant_id, branch_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS branch_risk_predictions (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  branch_id text NOT NULL,
  horizon_hours integer NOT NULL CHECK (horizon_hours > 0 AND horizon_hours <= 168),
  probability numeric(5,4) NOT NULL CHECK (probability >= 0 AND probability <= 1),
  risk_level text NOT NULL,
  confidence text NOT NULL,
  data_quality numeric(5,4) NOT NULL CHECK (data_quality >= 0 AND data_quality <= 1),
  prediction_data jsonb NOT NULL,
  generated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS branch_risk_predictions_active_idx
  ON branch_risk_predictions (tenant_id, branch_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS branch_risk_predictions_history_idx
  ON branch_risk_predictions (tenant_id, branch_id, generated_at DESC);
