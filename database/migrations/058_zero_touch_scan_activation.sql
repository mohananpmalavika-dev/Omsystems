ALTER TABLE edge_scan_jobs
  ADD COLUMN IF NOT EXISTS provisioned_count integer NOT NULL DEFAULT 0
    CHECK (provisioned_count >= 0),
  ADD COLUMN IF NOT EXISTS credentials_required_count integer NOT NULL DEFAULT 0
    CHECK (credentials_required_count >= 0),
  ADD COLUMN IF NOT EXISTS pending_verification_count integer NOT NULL DEFAULT 0
    CHECK (pending_verification_count >= 0);
