-- Migration: Create service credentials table
-- Purpose: Store service authentication credentials for Phase 1 (rotated secrets)
-- Security: Enables credential rotation without downtime
-- 
-- Note: This is for Phase 1 secret-based auth. Phase 2+ should use JWT with asymmetric keys.

-- =====================================================
-- Service Credentials Table
-- =====================================================

CREATE TABLE IF NOT EXISTS service_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Service identifier
    service_id VARCHAR(100) NOT NULL,
    
    -- Credential identifier (for rotation tracking)
    credential_id VARCHAR(255) NOT NULL UNIQUE,
    
    -- Hashed secret (NEVER store plaintext)
    -- Use bcrypt, scrypt, or Argon2
    secret_hash TEXT NOT NULL,
    
    -- Salt (if not included in hash)
    secret_salt TEXT,
    
    -- Granted capabilities
    capabilities TEXT[] NOT NULL DEFAULT '{}',
    
    -- Tenant scope (NULL = cross-tenant allowed)
    tenant_id VARCHAR(255),
    
    -- Status
    enabled BOOLEAN NOT NULL DEFAULT true,
    
    -- Lifecycle timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    rotated_at TIMESTAMP WITH TIME ZONE,
    
    -- Rotation tracking
    replaces_credential_id VARCHAR(255),
    
    -- Metadata
    created_by VARCHAR(255),
    description TEXT,
    metadata JSONB,
    
    -- Check constraints
    CONSTRAINT chk_expires_future 
        CHECK (expires_at IS NULL OR expires_at > created_at),
    
    CONSTRAINT chk_capabilities_valid 
        CHECK (cardinality(capabilities) > 0)
);

-- =====================================================
-- Indexes
-- =====================================================

-- Index for credential lookup (authentication path)
CREATE UNIQUE INDEX idx_service_credentials_lookup 
    ON service_credentials (credential_id)
    WHERE enabled = true AND (expires_at IS NULL OR expires_at > NOW());

-- Index for service queries
CREATE INDEX idx_service_credentials_service 
    ON service_credentials (service_id, enabled);

-- Index for finding expired credentials
CREATE INDEX idx_service_credentials_expired 
    ON service_credentials (expires_at)
    WHERE expires_at IS NOT NULL AND expires_at < NOW();

-- Index for rotation queries
CREATE INDEX idx_service_credentials_rotation 
    ON service_credentials (replaces_credential_id)
    WHERE replaces_credential_id IS NOT NULL;

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON TABLE service_credentials IS 
    'Service authentication credentials with support for rotation. Used for Phase 1 secret-based auth before JWT implementation.';

COMMENT ON COLUMN service_credentials.service_id IS 
    'Service identifier (e.g., analytics-engine, recording-service)';

COMMENT ON COLUMN service_credentials.credential_id IS 
    'Unique credential identifier (e.g., analytics-key-v4)';

COMMENT ON COLUMN service_credentials.secret_hash IS 
    'Hashed secret using bcrypt/scrypt/Argon2. NEVER store plaintext secrets.';

COMMENT ON COLUMN service_credentials.capabilities IS 
    'Array of granted capabilities (e.g., {notifications:create, analytics:submit})';

COMMENT ON COLUMN service_credentials.tenant_id IS 
    'If set, restricts credential to specific tenant. NULL allows cross-tenant.';

COMMENT ON COLUMN service_credentials.enabled IS 
    'Whether credential is active. Set to false to revoke without deletion.';

COMMENT ON COLUMN service_credentials.expires_at IS 
    'When credential expires. NULL = never expires (not recommended for production).';

COMMENT ON COLUMN service_credentials.last_used_at IS 
    'Last successful authentication with this credential (for monitoring)';

COMMENT ON COLUMN service_credentials.replaces_credential_id IS 
    'Previous credential ID if this is a rotation. Enables tracking credential lineage.';

-- =====================================================
-- Trigger: Update last_used_at
-- =====================================================

-- Note: In production, updating last_used_at on every auth can cause contention.
-- Consider:
-- 1. Async update via background job
-- 2. Update only once per hour per credential
-- 3. Log usage separately and aggregate periodically

-- =====================================================
-- Sample Usage
-- =====================================================

-- Create new credential (application code should hash the secret):
-- INSERT INTO service_credentials (
--     service_id, credential_id, secret_hash, capabilities, created_by, description
-- )
-- VALUES (
--     'analytics-engine',
--     'analytics-key-v5',
--     '$2b$12$...',  -- bcrypt hash
--     ARRAY['notifications:create', 'analytics:submit'],
--     'admin@example.com',
--     'Analytics Engine production credential v5'
-- );

-- Rotate credential (keep both active temporarily):
-- Step 1: Create new credential
-- INSERT INTO service_credentials (
--     service_id, credential_id, secret_hash, capabilities, 
--     replaces_credential_id, created_by
-- )
-- VALUES (
--     'analytics-engine', 'analytics-key-v6', '$2b$12$...', 
--     ARRAY['notifications:create', 'analytics:submit'],
--     'analytics-key-v5', 'admin@example.com'
-- );
-- 
-- Step 2: Deploy service with new credential
-- Step 3: Disable old credential after verification
-- UPDATE service_credentials 
-- SET enabled = false, rotated_at = NOW()
-- WHERE credential_id = 'analytics-key-v5';

-- Lookup active credential:
-- SELECT service_id, capabilities, tenant_id
-- FROM service_credentials
-- WHERE credential_id = 'analytics-key-v5'
--   AND enabled = true
--   AND (expires_at IS NULL OR expires_at > NOW());

-- Find credentials needing rotation (older than 90 days):
-- SELECT service_id, credential_id, created_at
-- FROM service_credentials
-- WHERE enabled = true
--   AND created_at < NOW() - INTERVAL '90 days'
--   AND rotated_at IS NULL;

-- Audit credential usage:
-- SELECT 
--     service_id, 
--     credential_id, 
--     created_at,
--     last_used_at,
--     EXTRACT(EPOCH FROM (NOW() - last_used_at))/3600 AS hours_since_last_use
-- FROM service_credentials
-- WHERE enabled = true
-- ORDER BY last_used_at DESC NULLS LAST;

-- =====================================================
-- Security Best Practices
-- =====================================================

-- 1. Secret Generation:
--    - Generate secrets with cryptographically secure random number generator
--    - Minimum 256 bits of entropy (e.g., base64-encoded 32 bytes)
--    - Use format: <credential-id>:<secret> for Authorization header
--
-- 2. Secret Hashing:
--    - Use bcrypt (work factor >= 12), scrypt, or Argon2
--    - Never store plaintext secrets in database
--    - Hash verification must use constant-time comparison
--
-- 3. Rotation Policy:
--    - Rotate credentials every 90 days
--    - Support two simultaneously valid credentials during rotation
--    - Track rotation lineage via replaces_credential_id
--    - Automate rotation reminders
--
-- 4. Monitoring:
--    - Alert on authentication failures
--    - Alert on credential not used for 30+ days (may be leaked)
--    - Alert on credential used from unexpected IP ranges
--    - Track last_used_at for compliance
--
-- 5. Revocation:
--    - Immediate revocation: SET enabled = false
--    - Soft deletion: Keep record for audit, set enabled = false
--    - Hard deletion: Only for compliance requirements (retain audit logs)
--
-- 6. Access Control:
--    - Encrypt database at rest
--    - Restrict database access to application service account
--    - Separate credentials for read vs. write operations
--    - Use database-level audit logging

-- Grant appropriate permissions:
-- GRANT SELECT ON service_credentials TO backend_app_user;
-- GRANT INSERT, UPDATE ON service_credentials TO credential_admin_user;
-- REVOKE DELETE ON service_credentials FROM backend_app_user;

-- =====================================================
-- Migration to JWT (Phase 2)
-- =====================================================

-- Once JWT infrastructure is ready:
-- 1. Keep this table for audit/inventory
-- 2. Add jwt_public_key column for each service
-- 3. Gradually migrate services from secrets to JWT
-- 4. Mark secret-based credentials as deprecated
-- 5. Eventually disable secret-based auth entirely
-- 
-- ALTER TABLE service_credentials 
-- ADD COLUMN jwt_public_key TEXT,
-- ADD COLUMN auth_method VARCHAR(20) DEFAULT 'secret' CHECK (auth_method IN ('secret', 'jwt'));
