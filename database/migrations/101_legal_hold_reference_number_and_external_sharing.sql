-- 101_legal_hold_reference_number_and_external_sharing.sql
-- Production hardening for Canonical Legal Hold Reference Number and Audited External Evidence Sharing

-- 1. Canonical Legal Hold Reference Number (P0.13)
ALTER TABLE recording_legal_holds
  ADD COLUMN IF NOT EXISTS reference_number text UNIQUE;

CREATE INDEX IF NOT EXISTS recording_legal_holds_ref_num_idx
  ON recording_legal_holds (reference_number);

-- 2. External Evidence Sharing Table (P0.25)
CREATE TABLE IF NOT EXISTS external_evidence_shares (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  export_id text NOT NULL,
  evidence_package_id text,
  share_token text UNIQUE NOT NULL,
  recipient_email text NOT NULL,
  reason text NOT NULL,
  scope text NOT NULL DEFAULT 'VIEW_ONLY',
  password_hash text,
  max_downloads integer NOT NULL DEFAULT 3,
  download_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by text,
  revocation_reason text
);

CREATE INDEX IF NOT EXISTS external_evidence_shares_token_idx
  ON external_evidence_shares (share_token);

CREATE INDEX IF NOT EXISTS external_evidence_shares_tenant_idx
  ON external_evidence_shares (tenant_id, expires_at);
