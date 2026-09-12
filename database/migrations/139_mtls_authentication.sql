-- Migration 139: Mutual TLS (mTLS) Authentication Infrastructure (security.mtls)
-- Production schema for client certificate pinning, revocation registry, and cryptographic audit logs.

-- 1. Trusted Certificate Pins Table
CREATE TABLE IF NOT EXISTS mtls_certificate_pins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id VARCHAR(128) NOT NULL,
    role VARCHAR(64) NOT NULL, -- 'EDGE_AGENT', 'EDGE_GATEWAY', 'MEDIA_NODE', 'RECORDING_ENGINE', 'CONTROL_PLANE'
    cert_fingerprint VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 lowercase hex
    common_name VARCHAR(255),
    allowed_sans TEXT[] NOT NULL DEFAULT '{}',
    subject_dn TEXT,
    issuer_dn TEXT,
    serial_number VARCHAR(128),
    not_before TIMESTAMPTZ,
    not_after TIMESTAMPTZ,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'REVOKED', 'EXPIRED', 'SUSPENDED'
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    pinned_by VARCHAR(128) NOT NULL DEFAULT 'security-admin',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mtls_pins_fingerprint 
    ON mtls_certificate_pins (cert_fingerprint);

CREATE INDEX IF NOT EXISTS idx_mtls_pins_node_role 
    ON mtls_certificate_pins (node_id, role);

CREATE INDEX IF NOT EXISTS idx_mtls_pins_status 
    ON mtls_certificate_pins (status);

CREATE INDEX IF NOT EXISTS idx_mtls_pins_expiry 
    ON mtls_certificate_pins (not_after);


-- 2. Certificate Revocation List (CRL) Registry Table
CREATE TABLE IF NOT EXISTS mtls_revoked_certificates (
    fingerprint VARCHAR(64) PRIMARY KEY, -- SHA-256 lowercase hex
    serial_number VARCHAR(128),
    issuer_dn TEXT,
    revocation_reason TEXT NOT NULL,
    revoked_by VARCHAR(128) NOT NULL DEFAULT 'security-admin',
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mtls_revocations_revoked_at 
    ON mtls_revoked_certificates (revoked_at DESC);


-- 3. mTLS Authentication Audit Log Table
CREATE TABLE IF NOT EXISTS mtls_auth_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id VARCHAR(128),
    role VARCHAR(64),
    fingerprint VARCHAR(64) NOT NULL,
    client_ip VARCHAR(64),
    endpoint VARCHAR(255),
    decision VARCHAR(32) NOT NULL, -- 'ALLOWED', 'REJECTED'
    rejection_reason TEXT,
    tls_version VARCHAR(32),
    cipher_suite VARCHAR(128),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mtls_audit_timestamp 
    ON mtls_auth_audit_log (timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_mtls_audit_fingerprint 
    ON mtls_auth_audit_log (fingerprint);

CREATE INDEX IF NOT EXISTS idx_mtls_audit_node 
    ON mtls_auth_audit_log (node_id);
