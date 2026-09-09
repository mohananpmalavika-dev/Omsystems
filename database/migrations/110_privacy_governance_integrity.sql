-- Privacy governance integrity: stable business identifiers and valid
-- assignment windows. Tenant/resource access is additionally enforced in the
-- API because camera privacy tables inherit tenancy through camera ownership.
CREATE UNIQUE INDEX IF NOT EXISTS privacy_purposes_tenant_name_unique
  ON privacy_purposes (tenant_id, lower(btrim(name)));

CREATE UNIQUE INDEX IF NOT EXISTS camera_privacy_purpose_assignments_camera_purpose_start_unique
  ON camera_privacy_purpose_assignments (camera_id, purpose_id, COALESCE(start_date, '-infinity'::date));

ALTER TABLE camera_privacy_purpose_assignments
  DROP CONSTRAINT IF EXISTS camera_privacy_purpose_assignment_period_valid;
ALTER TABLE camera_privacy_purpose_assignments
  ADD CONSTRAINT camera_privacy_purpose_assignment_period_valid
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date > start_date);
