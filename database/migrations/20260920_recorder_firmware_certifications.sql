CREATE TABLE IF NOT EXISTS recorder_certifications (
  id text PRIMARY KEY,
  vendor text NOT NULL,
  manufacturer text,
  model_pattern text NOT NULL,
  firmware_version_pattern text NOT NULL,
  hardware_revision text,
  serial_number text,
  test_suite_version text,
  test_environment text,
  test_operator text,
  compatibility_level text NOT NULL,
  features jsonb NOT NULL,
  certification_status text NOT NULL,
  tested_by text NOT NULL,
  notes text,
  evidence_artifacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  attestation jsonb,
  certified_at timestamptz,
  test_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recorder_certification_status_check CHECK (
    certification_status IN ('UNTESTED','UNVERIFIED','PROVISIONAL','TEST_REQUIRED','PARTIALLY_SUPPORTED','CERTIFIED','FAILED','DEPRECATED')
  )
);

CREATE INDEX IF NOT EXISTS idx_recorder_certifications_firmware_matrix
  ON recorder_certifications (lower(vendor), lower(model_pattern), lower(firmware_version_pattern));

CREATE UNIQUE INDEX IF NOT EXISTS uq_recorder_certifications_exact_lab_result
  ON recorder_certifications (
    lower(vendor), lower(model_pattern), lower(firmware_version_pattern),
    COALESCE(hardware_revision, ''), COALESCE(test_suite_version, ''), COALESCE(test_date, 'epoch'::timestamptz)
  );

ALTER TABLE recorder_certifications ENABLE ROW LEVEL SECURITY;
