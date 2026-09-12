-- Migration 142: Cryptographically Signed Edge Config Bundles (security.signed_configuration)
-- Enterprise-grade schema for cryptographic key lifecycle, tamper-evident configuration bundles,
-- edge verification receipts, and immutable audit trails.

-- 1. Edge Config Signing Keys Table
CREATE TABLE IF NOT EXISTS edge_config_signing_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_id VARCHAR(64) NOT NULL UNIQUE,
    algorithm VARCHAR(32) NOT NULL, -- 'RSA-PSS-SHA256', 'RSA-PKCS1-SHA256', 'HMAC-SHA256', 'ED25519'
    key_size INTEGER NOT NULL DEFAULT 2048, -- 2048, 4096, 256
    public_key_pem TEXT, -- Public key in PEM format for asymmetric RSA/Ed25519; NULL for HMAC
    private_key_pem TEXT, -- Private key (encrypted or stored in dev/test); NULL if in HSM
    hmac_secret TEXT, -- Secret for HMAC; NULL for asymmetric algorithms
    key_fingerprint VARCHAR(64) NOT NULL, -- SHA-256 hex digest of public key or HMAC identifier
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'RETIRED', 'REVOKED'
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    sign_count BIGINT NOT NULL DEFAULT 0,
    verify_count BIGINT NOT NULL DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_edge_config_keys_id ON edge_config_signing_keys(key_id);
CREATE INDEX IF NOT EXISTS idx_edge_config_keys_status ON edge_config_signing_keys(status);
CREATE INDEX IF NOT EXISTS idx_edge_config_keys_algo ON edge_config_signing_keys(algorithm);

-- 2. Ensure edge_signed_configurations Table Exists and Has Full Enterprise Fields
CREATE TABLE IF NOT EXISTS edge_signed_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bundle_id VARCHAR(64),
    edge_id VARCHAR(64) NOT NULL,
    branch_id VARCHAR(64),
    version INTEGER NOT NULL,
    previous_version INTEGER,
    payload JSONB NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    canonical_payload_hash VARCHAR(64),
    header_payload JSONB,
    nonce VARCHAR(64),
    signature TEXT NOT NULL,
    algorithm VARCHAR(32) NOT NULL DEFAULT 'HMAC-SHA256',
    key_id VARCHAR(64),
    signer_identity VARCHAR(128) NOT NULL,
    signer_role VARCHAR(64) DEFAULT 'SECURITY_ADMIN',
    status VARCHAR(32) NOT NULL DEFAULT 'DESIRED', -- 'DESIRED', 'APPLIED', 'DRIFTED', 'ROLLED_BACK', 'REVOKED'
    verification_status VARCHAR(32) DEFAULT 'UNCHECKED', -- 'VERIFIED', 'FAILED', 'TAMPERED', 'UNCHECKED'
    verification_error TEXT,
    expires_at TIMESTAMPTZ,
    applied_version INTEGER,
    applied_at TIMESTAMPTZ,
    applied_hash VARCHAR(64),
    drift_details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_edge_version UNIQUE (edge_id, version)
);

-- Add columns if table was previously created by migration 130 without the new columns
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='edge_signed_configurations' AND column_name='bundle_id') THEN
        ALTER TABLE edge_signed_configurations ADD COLUMN bundle_id VARCHAR(64);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='edge_signed_configurations' AND column_name='previous_version') THEN
        ALTER TABLE edge_signed_configurations ADD COLUMN previous_version INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='edge_signed_configurations' AND column_name='canonical_payload_hash') THEN
        ALTER TABLE edge_signed_configurations ADD COLUMN canonical_payload_hash VARCHAR(64);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='edge_signed_configurations' AND column_name='header_payload') THEN
        ALTER TABLE edge_signed_configurations ADD COLUMN header_payload JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='edge_signed_configurations' AND column_name='nonce') THEN
        ALTER TABLE edge_signed_configurations ADD COLUMN nonce VARCHAR(64);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='edge_signed_configurations' AND column_name='algorithm') THEN
        ALTER TABLE edge_signed_configurations ADD COLUMN algorithm VARCHAR(32) NOT NULL DEFAULT 'HMAC-SHA256';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='edge_signed_configurations' AND column_name='key_id') THEN
        ALTER TABLE edge_signed_configurations ADD COLUMN key_id VARCHAR(64);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='edge_signed_configurations' AND column_name='signer_role') THEN
        ALTER TABLE edge_signed_configurations ADD COLUMN signer_role VARCHAR(64) DEFAULT 'SECURITY_ADMIN';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='edge_signed_configurations' AND column_name='verification_status') THEN
        ALTER TABLE edge_signed_configurations ADD COLUMN verification_status VARCHAR(32) DEFAULT 'UNCHECKED';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='edge_signed_configurations' AND column_name='verification_error') THEN
        ALTER TABLE edge_signed_configurations ADD COLUMN verification_error TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='edge_signed_configurations' AND column_name='expires_at') THEN
        ALTER TABLE edge_signed_configurations ADD COLUMN expires_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='edge_signed_configurations' AND column_name='applied_hash') THEN
        ALTER TABLE edge_signed_configurations ADD COLUMN applied_hash VARCHAR(64);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='edge_signed_configurations' AND column_name='updated_at') THEN
        ALTER TABLE edge_signed_configurations ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_signed_config_edge_version 
    ON edge_signed_configurations (edge_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_signed_config_bundle_id 
    ON edge_signed_configurations (bundle_id);

CREATE INDEX IF NOT EXISTS idx_signed_config_status 
    ON edge_signed_configurations (status);

-- 3. Edge Configuration Verification Receipts Table
CREATE TABLE IF NOT EXISTS edge_config_verification_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bundle_id VARCHAR(64) NOT NULL,
    edge_id VARCHAR(64) NOT NULL,
    version INTEGER NOT NULL,
    applied_hash VARCHAR(64) NOT NULL,
    verification_result VARCHAR(32) NOT NULL, -- 'VERIFIED', 'FAILED', 'TAMPERED'
    rejection_reason TEXT,
    edge_agent_version VARCHAR(32),
    client_ip VARCHAR(64),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receipts_edge_version ON edge_config_verification_receipts(edge_id, version);
CREATE INDEX IF NOT EXISTS idx_receipts_bundle_id ON edge_config_verification_receipts(bundle_id);

-- 4. Edge Configuration Cryptographic Audit Log Table
CREATE TABLE IF NOT EXISTS edge_config_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(64) NOT NULL, -- 'KEY_GENERATED', 'KEY_ROTATED', 'KEY_REVOKED', 'BUNDLE_SIGNED', 'BUNDLE_VERIFIED', 'BUNDLE_APPLIED', 'BUNDLE_REJECTED', 'DRIFT_DETECTED'
    key_id VARCHAR(64),
    bundle_id VARCHAR(64),
    edge_id VARCHAR(64),
    version INTEGER,
    actor_id VARCHAR(128) NOT NULL,
    actor_type VARCHAR(32) NOT NULL DEFAULT 'SYSTEM', -- 'USER', 'SYSTEM', 'EDGE_AGENT'
    status VARCHAR(32) NOT NULL DEFAULT 'SUCCESS', -- 'SUCCESS', 'FAILURE'
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_edge_config_audit_event ON edge_config_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_edge_config_audit_edge ON edge_config_audit_logs(edge_id);
CREATE INDEX IF NOT EXISTS idx_edge_config_audit_created ON edge_config_audit_logs(created_at DESC);
