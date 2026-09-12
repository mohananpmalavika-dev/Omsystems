-- Migration 140: Hardware Security Module (HSM) Evidence Signing (security.hsm_evidence_signing)
-- Production schema for PKCS#11 hardware token registry, key registry, HSM-sealed evidence packages, and cryptographic audit logs.

-- 1. HSM Token Registry Table
CREATE TABLE IF NOT EXISTS hsm_token_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_id INTEGER NOT NULL,
    token_label VARCHAR(128) NOT NULL,
    token_serial VARCHAR(128) NOT NULL UNIQUE,
    manufacturer VARCHAR(128) NOT NULL,
    model VARCHAR(128) NOT NULL,
    firmware_version VARCHAR(64),
    hardware_version VARCHAR(64),
    fips_level INTEGER DEFAULT 3,
    module_path VARCHAR(512) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ONLINE', -- 'ONLINE', 'OFFLINE', 'LOCKED', 'DEGRADED'
    pin_source_type VARCHAR(32) NOT NULL DEFAULT 'env', -- 'env', 'file', 'secret'
    total_sessions INTEGER NOT NULL DEFAULT 1,
    active_sessions INTEGER NOT NULL DEFAULT 0,
    mechanisms TEXT[] NOT NULL DEFAULT '{}',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hsm_tokens_slot 
    ON hsm_token_registry (slot_id);

CREATE INDEX IF NOT EXISTS idx_hsm_tokens_status 
    ON hsm_token_registry (status);

CREATE INDEX IF NOT EXISTS idx_hsm_tokens_serial 
    ON hsm_token_registry (token_serial);


-- 2. HSM Key Registry Table
CREATE TABLE IF NOT EXISTS hsm_key_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_label VARCHAR(128) NOT NULL UNIQUE,
    token_serial VARCHAR(128) REFERENCES hsm_token_registry(token_serial) ON DELETE SET NULL,
    cka_id VARCHAR(128),
    algorithm VARCHAR(64) NOT NULL, -- 'ECDSA_P256', 'ECDSA_P384', 'RSA_PSS_SHA256', 'RSA_PKCS1_SHA256'
    key_size INTEGER NOT NULL DEFAULT 256,
    purpose VARCHAR(64) NOT NULL DEFAULT 'EVIDENCE_SIGNING',
    public_key_pem TEXT NOT NULL,
    public_key_fingerprint VARCHAR(64) NOT NULL, -- SHA-256 lowercase hex
    certificate_pem TEXT,
    certificate_chain TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sign_count BIGINT NOT NULL DEFAULT 0,
    verify_count BIGINT NOT NULL DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hsm_keys_label 
    ON hsm_key_registry (key_label);

CREATE INDEX IF NOT EXISTS idx_hsm_keys_fingerprint 
    ON hsm_key_registry (public_key_fingerprint);

CREATE INDEX IF NOT EXISTS idx_hsm_keys_token 
    ON hsm_key_registry (token_serial);

CREATE INDEX IF NOT EXISTS idx_hsm_keys_active 
    ON hsm_key_registry (is_active);


-- 3. HSM Signed Evidence Packages Table
CREATE TABLE IF NOT EXISTS hsm_signed_evidence_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_id VARCHAR(128) NOT NULL UNIQUE,
    tenant_id VARCHAR(128) NOT NULL,
    branch_id VARCHAR(128),
    camera_id VARCHAR(128),
    manifest_sha256 VARCHAR(64) NOT NULL,
    key_label VARCHAR(128) NOT NULL,
    key_fingerprint VARCHAR(64) NOT NULL,
    algorithm VARCHAR(64) NOT NULL,
    signature_base64 TEXT NOT NULL,
    signature_der_hex TEXT NOT NULL,
    certificate_pem TEXT,
    certificate_chain TEXT[] NOT NULL DEFAULT '{}',
    manifest_payload JSONB NOT NULL,
    artifacts_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
    time_sync_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    verification_status VARCHAR(32) NOT NULL DEFAULT 'VERIFIED', -- 'VERIFIED', 'FAILED', 'UNCHECKED'
    signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hsm_packages_evidence_id 
    ON hsm_signed_evidence_packages (evidence_id);

CREATE INDEX IF NOT EXISTS idx_hsm_packages_tenant 
    ON hsm_signed_evidence_packages (tenant_id);

CREATE INDEX IF NOT EXISTS idx_hsm_packages_manifest_sha 
    ON hsm_signed_evidence_packages (manifest_sha256);

CREATE INDEX IF NOT EXISTS idx_hsm_packages_signed_at 
    ON hsm_signed_evidence_packages (signed_at DESC);


-- 4. HSM Cryptographic Audit Log Table
CREATE TABLE IF NOT EXISTS hsm_cryptographic_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation VARCHAR(64) NOT NULL, -- 'SIGN_EVIDENCE', 'VERIFY_EVIDENCE', 'TOKEN_LOGIN', 'TOKEN_LOGOUT', 'KEY_REGISTER', 'KEY_ROTATION', 'HEALTH_PROBE'
    key_label VARCHAR(128),
    token_serial VARCHAR(128),
    evidence_id VARCHAR(128),
    actor_id VARCHAR(128) NOT NULL,
    actor_type VARCHAR(32) NOT NULL DEFAULT 'SERVICE', -- 'USER', 'SERVICE', 'SYSTEM'
    status VARCHAR(32) NOT NULL, -- 'SUCCESS', 'FAILURE'
    error_message TEXT,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hsm_audit_timestamp 
    ON hsm_cryptographic_audit_log (timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_hsm_audit_operation 
    ON hsm_cryptographic_audit_log (operation);

CREATE INDEX IF NOT EXISTS idx_hsm_audit_evidence 
    ON hsm_cryptographic_audit_log (evidence_id);

CREATE INDEX IF NOT EXISTS idx_hsm_audit_key 
    ON hsm_cryptographic_audit_log (key_label);
