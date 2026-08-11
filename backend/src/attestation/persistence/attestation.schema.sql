/**
 * TPM Attestation Database Schema
 * PostgreSQL schema for attestation evidence and challenges
 */

-- ============================================================================
-- Attestation Challenges
-- ============================================================================

CREATE TABLE IF NOT EXISTS tpm_attestation_challenges (
    id VARCHAR(64) PRIMARY KEY,
    
    tenant_id UUID NOT NULL,
    device_id UUID NOT NULL,
    
    -- Challenge data
    nonce TEXT NOT NULL, -- base64 encoded
    requested_pcrs INTEGER[] NOT NULL,
    hash_algorithm VARCHAR(16) NOT NULL,
    
    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    
    -- Indexes
    CONSTRAINT check_expires_after_created CHECK (expires_at > created_at)
);

CREATE INDEX idx_challenges_device_created 
ON tpm_attestation_challenges (tenant_id, device_id, created_at DESC);

CREATE INDEX idx_challenges_expires 
ON tpm_attestation_challenges (expires_at) 
WHERE consumed_at IS NULL;

CREATE INDEX idx_challenges_consumed 
ON tpm_attestation_challenges (consumed_at) 
WHERE consumed_at IS NOT NULL;

-- ============================================================================
-- Device Attestation Identities (Enrolled AKs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS device_attestation_identities (
    id VARCHAR(64) PRIMARY KEY,
    
    tenant_id UUID NOT NULL,
    device_id UUID NOT NULL,
    
    -- AK data
    ak_name VARCHAR(128) NOT NULL,
    ak_public_key_fingerprint VARCHAR(64) NOT NULL UNIQUE,
    ak_public_key_pem TEXT NOT NULL,
    
    -- Optional EK
    endorsement_key_fingerprint VARCHAR(64),
    
    -- Device metadata
    manufacturer VARCHAR(128),
    model VARCHAR(128),
    
    -- Lifecycle
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    
    -- Constraints
    CONSTRAINT unique_device_ak UNIQUE (tenant_id, device_id),
    CONSTRAINT check_revocation CHECK (
        (revoked_at IS NULL AND revocation_reason IS NULL) OR
        (revoked_at IS NOT NULL)
    )
);

CREATE INDEX idx_identities_tenant_device 
ON device_attestation_identities (tenant_id, device_id);

CREATE INDEX idx_identities_fingerprint 
ON device_attestation_identities (ak_public_key_fingerprint);

CREATE INDEX idx_identities_active 
ON device_attestation_identities (tenant_id) 
WHERE revoked_at IS NULL;

-- ============================================================================
-- TPM Attestation Evidence (Immutable Records)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tpm_attestation_evidence (
    id VARCHAR(64) PRIMARY KEY,
    
    tenant_id UUID NOT NULL,
    device_id UUID NOT NULL,
    challenge_id VARCHAR(64) NOT NULL REFERENCES tpm_attestation_challenges(id),
    
    -- TPM evidence (binary)
    quote BYTEA NOT NULL,
    signature BYTEA NOT NULL,
    
    -- PCR values (JSONB for flexibility)
    pcr_values JSONB NOT NULL,
    
    -- AK reference
    ak_fingerprint VARCHAR(64) NOT NULL,
    
    -- Optional event log
    event_log BYTEA,
    
    -- TPM metadata
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Timestamps
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verified_at TIMESTAMPTZ,
    
    -- Verification results
    verification_status VARCHAR(16) NOT NULL CHECK (
        verification_status IN ('PENDING', 'VERIFIED', 'FAILED', 'UNKNOWN')
    ),
    failure_reason VARCHAR(64),
    
    -- Policy evaluation
    policy_evaluation_result JSONB,
    
    -- Constraints
    CONSTRAINT check_verified_at CHECK (
        (verification_status = 'VERIFIED' AND verified_at IS NOT NULL) OR
        (verification_status != 'VERIFIED')
    )
);

CREATE INDEX idx_evidence_device_received 
ON tpm_attestation_evidence (tenant_id, device_id, received_at DESC);

CREATE INDEX idx_evidence_challenge 
ON tpm_attestation_evidence (challenge_id);

CREATE INDEX idx_evidence_status 
ON tpm_attestation_evidence (verification_status, verified_at DESC);

CREATE INDEX idx_evidence_ak 
ON tpm_attestation_evidence (ak_fingerprint);

-- Partial index for latest evidence per device
CREATE INDEX idx_evidence_latest 
ON tpm_attestation_evidence (device_id, received_at DESC) 
WHERE verification_status = 'VERIFIED';

-- ============================================================================
-- PCR Policies
-- ============================================================================

CREATE TABLE IF NOT EXISTS pcr_policies (
    id VARCHAR(64) PRIMARY KEY,
    
    tenant_id UUID NOT NULL,
    
    -- Policy identification
    name VARCHAR(256) NOT NULL,
    platform VARCHAR(128) NOT NULL,
    device_model VARCHAR(128),
    firmware_version VARCHAR(128),
    
    -- Allowed measurements (JSONB array)
    allowed_measurements JSONB NOT NULL,
    
    -- Validity period
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    
    -- Status
    status VARCHAR(16) NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED')),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT check_validity CHECK (
        valid_until IS NULL OR valid_until > valid_from
    )
);

CREATE INDEX idx_policies_tenant_platform 
ON pcr_policies (tenant_id, platform, status);

CREATE INDEX idx_policies_active 
ON pcr_policies (tenant_id) 
WHERE status = 'ACTIVE' AND (valid_until IS NULL OR valid_until > NOW());

CREATE INDEX idx_policies_device_model 
ON pcr_policies (tenant_id, platform, device_model) 
WHERE device_model IS NOT NULL;

-- ============================================================================
-- Tenant Default Policies
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant_default_policies (
    tenant_id UUID PRIMARY KEY,
    policy_id VARCHAR(64) NOT NULL REFERENCES pcr_policies(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Attestation Audit Log
-- ============================================================================

CREATE TABLE IF NOT EXISTS attestation_audit_log (
    id BIGSERIAL PRIMARY KEY,
    
    tenant_id UUID NOT NULL,
    device_id UUID NOT NULL,
    
    event_type VARCHAR(64) NOT NULL,
    event_data JSONB NOT NULL,
    
    -- Actor (if applicable)
    actor_id UUID,
    actor_type VARCHAR(32),
    
    -- Context
    ip_address INET,
    user_agent TEXT,
    
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant_device 
ON attestation_audit_log (tenant_id, device_id, timestamp DESC);

CREATE INDEX idx_audit_event_type 
ON attestation_audit_log (event_type, timestamp DESC);

CREATE INDEX idx_audit_timestamp 
ON attestation_audit_log (timestamp DESC);

-- ============================================================================
-- Views for Common Queries
-- ============================================================================

-- Latest attestation per device
CREATE OR REPLACE VIEW v_device_latest_attestation AS
SELECT DISTINCT ON (device_id)
    device_id,
    id AS evidence_id,
    tenant_id,
    verification_status,
    verified_at,
    received_at,
    failure_reason,
    policy_evaluation_result,
    ak_fingerprint
FROM tpm_attestation_evidence
ORDER BY device_id, received_at DESC;

-- Active challenges
CREATE OR REPLACE VIEW v_active_challenges AS
SELECT 
    id,
    tenant_id,
    device_id,
    nonce,
    requested_pcrs,
    hash_algorithm,
    created_at,
    expires_at,
    EXTRACT(EPOCH FROM (expires_at - NOW())) AS seconds_until_expiry
FROM tpm_attestation_challenges
WHERE consumed_at IS NULL 
  AND expires_at > NOW();

-- Device attestation status
CREATE OR REPLACE VIEW v_device_attestation_status AS
SELECT 
    i.tenant_id,
    i.device_id,
    i.ak_public_key_fingerprint,
    i.enrolled_at,
    i.revoked_at,
    i.manufacturer,
    i.model,
    e.evidence_id,
    e.verification_status,
    e.verified_at,
    e.received_at,
    CASE 
        WHEN e.verified_at IS NULL THEN 'NEVER_ATTESTED'
        WHEN EXTRACT(EPOCH FROM (NOW() - e.verified_at)) < 300 THEN 'FRESH'
        WHEN EXTRACT(EPOCH FROM (NOW() - e.verified_at)) < 1800 THEN 'ACCEPTABLE'
        WHEN EXTRACT(EPOCH FROM (NOW() - e.verified_at)) < 7200 THEN 'STALE'
        ELSE 'EXPIRED'
    END AS freshness
FROM device_attestation_identities i
LEFT JOIN v_device_latest_attestation e ON i.device_id = e.device_id
WHERE i.revoked_at IS NULL;

-- Policy compliance summary
CREATE OR REPLACE VIEW v_policy_compliance AS
SELECT 
    p.tenant_id,
    p.id AS policy_id,
    p.name AS policy_name,
    p.platform,
    COUNT(e.id) AS total_attestations,
    COUNT(e.id) FILTER (
        WHERE e.policy_evaluation_result->>'matched' = 'true'
    ) AS compliant_attestations,
    COUNT(e.id) FILTER (
        WHERE e.policy_evaluation_result->>'matched' = 'false'
    ) AS non_compliant_attestations
FROM pcr_policies p
LEFT JOIN tpm_attestation_evidence e ON 
    e.policy_evaluation_result->>'policyId' = p.id
    AND e.verification_status = 'VERIFIED'
    AND e.verified_at > NOW() - INTERVAL '24 hours'
WHERE p.status = 'ACTIVE'
GROUP BY p.tenant_id, p.id, p.name, p.platform;

-- ============================================================================
-- Functions
-- ============================================================================

-- Function to cleanup expired challenges
CREATE OR REPLACE FUNCTION cleanup_expired_challenges(
    older_than_hours INTEGER DEFAULT 24
) RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM tpm_attestation_challenges
    WHERE expires_at < NOW() - (older_than_hours || ' hours')::INTERVAL
    AND consumed_at IS NULL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get device attestation summary
CREATE OR REPLACE FUNCTION get_device_attestation_summary(
    p_tenant_id UUID
) RETURNS TABLE (
    total_devices BIGINT,
    enrolled_devices BIGINT,
    attested_devices BIGINT,
    fresh_attestations BIGINT,
    stale_attestations BIGINT,
    expired_attestations BIGINT,
    failed_attestations BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT device_id)::BIGINT AS total_devices,
        COUNT(DISTINCT device_id) FILTER (WHERE revoked_at IS NULL)::BIGINT AS enrolled_devices,
        COUNT(DISTINCT device_id) FILTER (WHERE verification_status = 'VERIFIED')::BIGINT AS attested_devices,
        COUNT(DISTINCT device_id) FILTER (WHERE freshness = 'FRESH')::BIGINT AS fresh_attestations,
        COUNT(DISTINCT device_id) FILTER (WHERE freshness = 'STALE')::BIGINT AS stale_attestations,
        COUNT(DISTINCT device_id) FILTER (WHERE freshness = 'EXPIRED')::BIGINT AS expired_attestations,
        COUNT(DISTINCT device_id) FILTER (WHERE verification_status = 'FAILED')::BIGINT AS failed_attestations
    FROM v_device_attestation_status
    WHERE tenant_id = p_tenant_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE tpm_attestation_challenges IS 
'Attestation challenges issued to devices with cryptographic nonces';

COMMENT ON TABLE device_attestation_identities IS 
'Enrolled Attestation Keys (AKs) for devices establishing trust';

COMMENT ON TABLE tpm_attestation_evidence IS 
'Immutable attestation evidence records with TPM quotes and verification results';

COMMENT ON TABLE pcr_policies IS 
'PCR measurement policies defining allowed platform states';

COMMENT ON COLUMN tpm_attestation_evidence.quote IS 
'TPM quote (TPMS_ATTEST structure) in binary format';

COMMENT ON COLUMN tpm_attestation_evidence.signature IS 
'TPM signature over quote in binary format';

COMMENT ON COLUMN tpm_attestation_evidence.pcr_values IS 
'PCR values as JSON: {"0": "abc123...", "7": "def456..."}';

COMMENT ON FUNCTION cleanup_expired_challenges IS 
'Maintenance function to remove expired unconsumed challenges';
