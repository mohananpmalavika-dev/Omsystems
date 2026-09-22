-- Behavioral analytics schema repair
-- Keeps behavioral predictions separate from predictive maintenance alerts.

CREATE TABLE IF NOT EXISTS behavior_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  location text,
  time_window text NOT NULL,
  avg_detections_per_hour numeric NOT NULL DEFAULT 0,
  avg_occupancy numeric NOT NULL DEFAULT 0,
  common_object_types text[] NOT NULL DEFAULT '{}',
  peak_hours integer[] NOT NULL DEFAULT '{}',
  quiet_hours integer[] NOT NULL DEFAULT '{}',
  typical_duration numeric NOT NULL DEFAULT 0,
  confidence_score numeric NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  learned_from integer NOT NULL DEFAULT 0,
  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (camera_id, time_window)
);

CREATE TABLE IF NOT EXISTS behavior_anomalies (
  id text PRIMARY KEY,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  camera_name text NOT NULL,
  timestamp timestamptz NOT NULL,
  anomaly_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  description text NOT NULL,
  expected_behavior text NOT NULL,
  actual_behavior text NOT NULL,
  recommendation text NOT NULL,
  metadata jsonb,
  reviewed boolean NOT NULL DEFAULT false,
  false_positive boolean NOT NULL DEFAULT false,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS behavioral_predictive_alerts (
  id text PRIMARY KEY,
  location text NOT NULL,
  branch_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  prediction_type text NOT NULL,
  probability numeric NOT NULL CHECK (probability >= 0 AND probability <= 1),
  time_window text NOT NULL,
  reasoning text NOT NULL,
  suggested_actions text[] NOT NULL DEFAULT '{}',
  based_on_patterns text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'triggered', 'dismissed', 'expired')),
  triggered_at timestamptz,
  dismissed_by text,
  dismissed_at timestamptz,
  dismissal_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS behavior_baselines_camera_idx ON behavior_baselines(camera_id, last_updated DESC);
CREATE INDEX IF NOT EXISTS behavior_anomalies_camera_idx ON behavior_anomalies(camera_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS behavioral_predictions_branch_idx ON behavioral_predictive_alerts(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS behavioral_predictions_status_idx ON behavioral_predictive_alerts(status, created_at DESC);
