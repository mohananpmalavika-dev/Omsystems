-- Migration 116: Evidence Redacted Export Hardening (GDPR / DPDP Compliance)
-- 
-- Adds authoritative tracking for privacy-redacted video exports, automated face & plate blurring,
-- and dedicated tamper-evident redaction compliance audit logs.

-- 1. Extend forensic_export_jobs with redaction audit and configuration fields
ALTER TABLE forensic_export_jobs
  ADD COLUMN IF NOT EXISTS redaction_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS redaction_config jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS redaction_summary jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS compliance_standard text CHECK (compliance_standard IS NULL OR compliance_standard IN ('GDPR', 'DPDP', 'HIPAA', 'CUSTOM'));

CREATE INDEX IF NOT EXISTS idx_forensic_export_jobs_redaction
  ON forensic_export_jobs (tenant_id, redaction_enabled, created_at DESC)
  WHERE redaction_enabled = true;

-- 2. Create authoritative evidence_redaction_logs table for GDPR/DPDP export compliance
CREATE TABLE IF NOT EXISTS evidence_redaction_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  export_job_id uuid NOT NULL REFERENCES forensic_export_jobs(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES evidence_cases(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  performed_by uuid NOT NULL REFERENCES users(id),
  compliance_standard text NOT NULL CHECK (compliance_standard IN ('GDPR', 'DPDP', 'HIPAA', 'CUSTOM')),
  targets text[] NOT NULL DEFAULT '{}',
  bounding_box_count integer NOT NULL DEFAULT 0,
  face_blur_applied boolean NOT NULL DEFAULT false,
  plate_blur_applied boolean NOT NULL DEFAULT false,
  static_zones_applied integer NOT NULL DEFAULT 0,
  audio_action text NOT NULL DEFAULT 'PASS_THROUGH' CHECK (audio_action IN ('PASS_THROUGH', 'MUTE', 'REMOVE_TRACK')),
  unredacted_sha256 text,
  redacted_sha256 text NOT NULL,
  certificate_id text NOT NULL,
  signature text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evidence_redaction_logs_tenant_case
  ON evidence_redaction_logs (tenant_id, case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_evidence_redaction_logs_export_job
  ON evidence_redaction_logs (export_job_id);

CREATE INDEX IF NOT EXISTS idx_evidence_redaction_logs_compliance
  ON evidence_redaction_logs (compliance_standard, created_at DESC);

COMMENT ON TABLE evidence_redaction_logs IS 
  'Authoritative tamper-evident audit ledger for GDPR/DPDP redacted video exports, preserving cryptographic provenance without storing sensitive unblurred personal data.';
