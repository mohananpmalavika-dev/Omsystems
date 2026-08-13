-- Durable evidence counters captured before verified discoveries are promoted
-- into the camera inventory. These let the control plane reconstruct a
-- provisioning run after a restart without retaining credentials or stream URIs.
ALTER TABLE edge_scan_jobs
  ADD COLUMN IF NOT EXISTS verified_count integer NOT NULL DEFAULT 0
    CHECK (verified_count >= 0),
  ADD COLUMN IF NOT EXISTS recorder_count integer NOT NULL DEFAULT 0
    CHECK (recorder_count >= 0),
  ADD COLUMN IF NOT EXISTS time_synchronized_count integer NOT NULL DEFAULT 0
    CHECK (time_synchronized_count >= 0),
  ADD COLUMN IF NOT EXISTS time_drift_count integer NOT NULL DEFAULT 0
    CHECK (time_drift_count >= 0),
  ADD COLUMN IF NOT EXISTS analytics_compatible_count integer NOT NULL DEFAULT 0
    CHECK (analytics_compatible_count >= 0),
  ADD COLUMN IF NOT EXISTS duplicate_count integer NOT NULL DEFAULT 0
    CHECK (duplicate_count >= 0);

ALTER TABLE camera_discoveries
  ADD COLUMN IF NOT EXISTS time_synchronization text
    CHECK (time_synchronization IS NULL OR time_synchronization IN ('synchronized', 'drifted', 'unknown'));
