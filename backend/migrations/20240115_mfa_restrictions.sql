/**
 * MFA Restrictions Table
 * 
 * Persistent storage for long-lived MFA restrictions and lockouts.
 * Redis handles short-term rate limits; this table handles persistent restrictions.
 * 
 * USE CASES:
 * - Security review holds (indefinite)
 * - Manual admin-imposed restrictions
 * - Cross-session lockout state
 * - Audit trail for restriction history
 */

-- Create restriction types enum
DO $$ BEGIN
  CREATE TYPE mfa_restriction_type AS ENUM (
    'SHORT_COOLDOWN',
    'GENERATION_BLOCKED',
    'ACCOUNT_TEMPORARILY_LOCKED',
    'SECURITY_REVIEW',
    'MANUAL_BLOCK'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create subject types enum
DO $$ BEGIN
  CREATE TYPE mfa_subject_type AS ENUM (
    'USER',
    'PHONE',
    'EMAIL',
    'IP',
    'DEVICE'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create restrictions table
CREATE TABLE IF NOT EXISTS mfa_restrictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Tenant context
  tenant_id UUID NOT NULL,
  
  -- Subject being restricted (HMAC-hashed for non-USER types)
  subject_type mfa_subject_type NOT NULL,
  subject_hash VARCHAR(128) NOT NULL, -- User ID or HMAC hash
  
  -- Restriction details
  restriction_type mfa_restriction_type NOT NULL,
  reason VARCHAR(256),
  
  -- Temporal
  imposed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- NULL = indefinite (manual review required)
  
  -- Metadata
  source_event_id UUID REFERENCES mfa_security_events(id),
  imposed_by UUID, -- Admin user ID who imposed restriction
  metadata JSONB NOT NULL DEFAULT '{}',
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint: one active restriction per subject
CREATE UNIQUE INDEX IF NOT EXISTS idx_mfa_restrictions_active_subject 
  ON mfa_restrictions(tenant_id, subject_type, subject_hash)
  WHERE expires_at IS NULL OR expires_at > NOW();

-- Index for finding active restrictions
CREATE INDEX IF NOT EXISTS idx_mfa_restrictions_active 
  ON mfa_restrictions(tenant_id, subject_type, subject_hash, expires_at)
  WHERE expires_at IS NULL OR expires_at > NOW();

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_mfa_restrictions_expired 
  ON mfa_restrictions(expires_at)
  WHERE expires_at IS NOT NULL;

-- Index for audit queries
CREATE INDEX IF NOT EXISTS idx_mfa_restrictions_imposed 
  ON mfa_restrictions(imposed_at DESC);

-- Index for finding restrictions by type
CREATE INDEX IF NOT EXISTS idx_mfa_restrictions_type 
  ON mfa_restrictions(restriction_type, imposed_at DESC);

-- Add table comments
COMMENT ON TABLE mfa_restrictions IS 
  'Persistent MFA restrictions and lockouts. Redis handles short-term rate limits.';

COMMENT ON COLUMN mfa_restrictions.subject_hash IS 
  'For USER: actual user_id UUID. For others: HMAC-SHA256 hash.';

COMMENT ON COLUMN mfa_restrictions.expires_at IS 
  'NULL means indefinite restriction requiring manual review.';

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_mfa_restrictions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mfa_restrictions_updated_at
  BEFORE UPDATE ON mfa_restrictions
  FOR EACH ROW
  EXECUTE FUNCTION update_mfa_restrictions_updated_at();

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON mfa_restrictions TO app_user;
-- GRANT SELECT ON mfa_restrictions TO readonly_user;
