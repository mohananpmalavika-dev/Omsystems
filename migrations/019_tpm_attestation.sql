-- TPM 2.0 Remote Attestation Database Schema
-- Production tables for device identities, challenges, and cryptographic evidence

-- 1. Device Attestation Identities (Enrolled AKs)
CREATE TABLE IF NOT EXISTS tpm_identities (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id UUID NOT NULL,
    device_id VARCHAR(64) NOT NULL,
    ak_name VARCHAR(128) NOT NULL,
    ak_public_key_fingerprint VARCHAR(64) NOT NULL UNIQUE,
    ak_public_key_pem TEXT NOT NULL,
    endorsement_key_fingerprint VARCHAR(64),
    manufacturer VARCHAR(128),
    firmware_version VARCHAR(128),
    trust_level VARCHAR(32) NOT NULL DEFAULT 'ENROLLED',
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_attested_at TIMESTAMPTZ,
    last_attestation_status VARCHAR(32),
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_tenant_device_ak UNIQUE (tenant_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_tpm_identities_device 
ON tpm_identities (device_id);

CREATE INDEX IF NOT EXISTS idx_tpm_identities_active 
ON tpm_identities (tenant_id, device_id) 
WHERE revoked_at IS NULL;

-- 2. Attestation Challenges (Anti-Replay CSPRNG Nonces)
CREATE TABLE IF NOT EXISTS tpm_attestation_challenges (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id UUID NOT NULL,
    device_id VARCHAR(64) NOT NULL,
    nonce TEXT NOT NULL,
    requested_pcrs INTEGER[] NOT NULL DEFAULT '{0,2,4,7}',
    hash_algorithm VARCHAR(16) NOT NULL DEFAULT 'sha256',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tpm_challenges_active 
ON tpm_attestation_challenges (device_id, expires_at) 
WHERE consumed_at IS NULL;

-- 3. TPM Attestation Evidence (Immutable Audit Ledger)
CREATE TABLE IF NOT EXISTS tpm_attestation_evidence (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id UUID NOT NULL,
    device_id VARCHAR(64) NOT NULL,
    challenge_id VARCHAR(64) NOT NULL REFERENCES tpm_attestation_challenges(id),
    quote TEXT NOT NULL,
    signature TEXT NOT NULL,
    pcr_values JSONB NOT NULL,
    pcr_selection JSONB NOT NULL,
    pcr_digest VARCHAR(128) NOT NULL,
    structure_valid BOOLEAN NOT NULL DEFAULT FALSE,
    nonce_verified BOOLEAN NOT NULL DEFAULT FALSE,
    signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
    pcr_digest_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ak_trusted BOOLEAN NOT NULL DEFAULT FALSE,
    policy_matched BOOLEAN NOT NULL DEFAULT FALSE,
    tpm_state VARCHAR(32) NOT NULL DEFAULT 'UNKNOWN',
    secure_boot_state VARCHAR(32) NOT NULL DEFAULT 'UNKNOWN',
    failure_reason TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verified_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tpm_evidence_device_time 
ON tpm_attestation_evidence (device_id, received_at DESC);

-- 4. Golden PCR Baseline Policies
CREATE TABLE IF NOT EXISTS tpm_pcr_policies (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    platform_type VARCHAR(64) NOT NULL,
    expected_pcrs JSONB NOT NULL,
    hash_algorithm VARCHAR(16) NOT NULL DEFAULT 'sha256',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default baseline policy for UEFI SecureBoot
INSERT INTO tpm_pcr_policies (id, name, description, platform_type, expected_pcrs, hash_algorithm, is_active)
VALUES (
    'policy_standard_uefi_v1',
    'Standard UEFI SecureBoot Platform Policy',
    'Validates PCR 0 (BIOS), PCR 2 (Option ROMs), PCR 4 (Boot Manager), and PCR 7 (SecureBoot)',
    'linux_standard',
    '{"required_pcrs": [0, 2, 4, 7], "secure_boot_pcr": 7}',
    'sha256',
    TRUE
)
ON CONFLICT (id) DO NOTHING;

-- 5. Audit Log for Security Governance
CREATE TABLE IF NOT EXISTS tpm_attestation_audit_log (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    device_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tpm_audit_device 
ON tpm_attestation_audit_log (device_id, created_at DESC);
