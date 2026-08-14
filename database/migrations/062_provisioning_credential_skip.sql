-- An operator can continue a branch scan with at least one verified camera
-- while deferring credentials for the remaining unavailable devices. The
-- decision is scoped to this durable scan only; a future scan asks again.
ALTER TABLE edge_scan_jobs
  ADD COLUMN IF NOT EXISTS credentials_skipped_at timestamptz;
