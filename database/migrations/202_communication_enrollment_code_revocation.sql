-- Enrollment codes are security credentials.  Revocation must be durable so
-- an exposed code cannot be reused before its natural expiry.
ALTER TABLE communication_enrollment_codes
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_comm_enrollment_codes_revoked
  ON communication_enrollment_codes(tenant_id, revoked_at)
  WHERE revoked_at IS NULL;
