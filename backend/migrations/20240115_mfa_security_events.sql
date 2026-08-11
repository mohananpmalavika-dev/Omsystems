/**
 * MFA Security Events Table
 * 
 * Persistent audit log for MFA security events.
 * Records rate limits, lockouts, verification attempts, and abuse patterns.
 * 
 * SECURITY:
 * - HMAC-hashed identifiers (no raw PII)
 * - Immutable audit trail (no updates, only inserts)
 * - Indexed for fast forensic queries
 * - Partitionable by created_at for scaling
 */

-- Create security event types enum
DO $$ BEGIN
  CREATE TYPE mfa_security_event_type AS ENUM (
    'MFA_GENERATION_REQUESTED',
    'MFA_GENERATION_RATE_LIMITED',
    'MFA_GENERATION_SUCCEEDED',
    'MFA_GENERATION_FAILED',
    'MFA_DELIVERY_SUCCEEDED',
    'MFA_DELIVERY_FAILED',
    'MFA_VERIFICATION_REQUESTED',
    'MFA_VERIFICATION_SUCCEEDED',
    'MFA_VERIFICATION_FAILED',
    'MFA_VERIFICATION_RATE_LIMITED',
    'MFA_CHALLENGE_LOCKED',
    'MFA_CHALLENGE_EXPIRED',
    'MFA_CHALLENGE_SUPERSEDED',
    'MFA_USER_TEMPORARILY_LOCKED',
    'MFA_IP_BLOCKED',
    'MFA_LOCKOUT_RELEASED',
    'MFA_SECURITY_REVIEW_TRIGGERED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create MFA method enum (if not exists)
DO $$ BEGIN
  CREATE TYPE mfa_method AS ENUM ('SMS', 'EMAIL', 'TOTP');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create security events table
CREATE TABLE IF NOT EXISTS mfa_security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Context
  tenant_id UUID NOT NULL,
  user_id UUID,
  challenge_id UUID,
  
  -- Event classification
  type mfa_security_event_type NOT NULL,
  method mfa_method NOT NULL,
  
  -- HMAC-hashed identifiers (NOT raw PII)
  ip_hash VARCHAR(64),
  device_hash VARCHAR(64),
  destination_hash VARCHAR(64), -- Phone or email hash
  
  -- Metrics
  attempts INTEGER,
  "limit" INTEGER,
  reason VARCHAR(128),
  
  -- Additional context
  metadata JSONB NOT NULL DEFAULT '{}',
  
  -- Timestamp (immutable)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_mfa_security_events_tenant_user 
  ON mfa_security_events(tenant_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mfa_security_events_user_type 
  ON mfa_security_events(user_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mfa_security_events_challenge 
  ON mfa_security_events(challenge_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mfa_security_events_type 
  ON mfa_security_events(type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mfa_security_events_created 
  ON mfa_security_events(created_at DESC);

-- Index for suspicious pattern detection
CREATE INDEX IF NOT EXISTS idx_mfa_security_events_failures 
  ON mfa_security_events(tenant_id, user_id, type, created_at DESC)
  WHERE type IN (
    'MFA_VERIFICATION_FAILED',
    'MFA_GENERATION_RATE_LIMITED',
    'MFA_VERIFICATION_RATE_LIMITED'
  );

-- Composite index for IP-based queries
CREATE INDEX IF NOT EXISTS idx_mfa_security_events_ip 
  ON mfa_security_events(ip_hash, created_at DESC)
  WHERE ip_hash IS NOT NULL;

-- Add table comment
COMMENT ON TABLE mfa_security_events IS 
  'Immutable audit log for MFA security events. Contains HMAC-hashed identifiers only.';

COMMENT ON COLUMN mfa_security_events.ip_hash IS 
  'HMAC-SHA256 hash of IP address (not reversible)';

COMMENT ON COLUMN mfa_security_events.device_hash IS 
  'HMAC-SHA256 hash of device identifier (not reversible)';

COMMENT ON COLUMN mfa_security_events.destination_hash IS 
  'HMAC-SHA256 hash of phone number or email (not reversible)';

-- Grant permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT ON mfa_security_events TO app_user;
-- GRANT SELECT ON mfa_security_events TO readonly_user;
